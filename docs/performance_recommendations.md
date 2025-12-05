# MySQL性能优化建议文档

## 概述

本文档针对AI代码审查GitLab系统的多租户MySQL架构，提供详细的性能优化建议、索引策略和查询最佳实践。

## 索引策略

### 多租户索引设计原则

#### 1. 项目隔离索引
所有业务查询索引都应以`project_id`作为第一列，确保多租户查询性能：

```sql
-- 正确的索引设计
INDEX idx_project_updated_at (project_id, updated_at)
INDEX idx_project_author (project_id, author)
INDEX idx_project_branch (project_id, source_branch, target_branch)

-- 错误的索引设计（缺少project_id前缀）
INDEX idx_updated_at (updated_at)  -- ❌ 会扫描所有项目数据
INDEX idx_author (author)          -- ❌ 跨项目查询性能差
```

#### 2. 核心业务索引
基于现有查询模式设计的关键索引：

```sql
-- MR审查日志表索引
ALTER TABLE mr_review_logs ADD INDEX idx_project_updated_at (project_id, updated_at);
ALTER TABLE mr_review_logs ADD INDEX idx_project_author (project_id, author);
ALTER TABLE mr_review_logs ADD INDEX idx_project_branch (project_id, source_branch, target_branch);
ALTER TABLE mr_review_logs ADD INDEX idx_last_commit (project_id, source_branch, target_branch, last_commit_id);
ALTER TABLE mr_review_logs ADD INDEX idx_review_status (review_status);

-- Push审查日志表索引
ALTER TABLE push_review_logs ADD INDEX idx_project_updated_at (project_id, updated_at);
ALTER TABLE push_review_logs ADD INDEX idx_project_author (project_id, author);
ALTER TABLE push_review_logs ADD INDEX idx_project_branch (project_id, branch);
ALTER TABLE push_review_logs ADD INDEX idx_review_status (review_status);

-- 项目管理表索引
ALTER TABLE projects ADD INDEX idx_name (name);
ALTER TABLE projects ADD INDEX idx_status (status);

-- 用户管理表索引
ALTER TABLE users ADD INDEX idx_username (username);
ALTER TABLE users ADD INDEX idx_email (email);
ALTER TABLE users ADD INDEX idx_role (role);

-- 配置管理表索引
ALTER TABLE project_configs ADD INDEX idx_project_type (project_id, config_type);
ALTER TABLE project_configs ADD INDEX idx_active (is_active);
```

#### 3. 复合索引优化
基于查询频率和选择性设计复合索引：

```sql
-- 高频查询：按项目和时间范围查询
-- 选择性：project_id (高) + updated_at (中) + author (低)
INDEX idx_project_time_author (project_id, updated_at, author)

-- 唯一性检查查询：检查last_commit_id是否存在
-- 选择性：project_id (高) + source_branch (中) + target_branch (中) + last_commit_id (高)
INDEX idx_unique_commit_check (project_id, source_branch, target_branch, last_commit_id)

-- 统计查询：按项目统计评分分布
-- 选择性：project_id (高) + score (中) + updated_at (中)
INDEX idx_project_score_time (project_id, score, updated_at)
```

### 索引维护策略

#### 1. 索引监控
定期监控索引使用情况：

```sql
-- 查看索引使用统计
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    INDEX_NAME,
    SEQ_IN_INDEX,
    COLUMN_NAME,
    CARDINALITY
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = 'your_database_name'
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 查看未使用的索引
SELECT 
    s.TABLE_SCHEMA,
    s.TABLE_NAME,
    s.INDEX_NAME
FROM information_schema.STATISTICS s
LEFT JOIN performance_schema.table_io_waits_summary_by_index_usage i
    ON s.TABLE_SCHEMA = i.OBJECT_SCHEMA 
    AND s.TABLE_NAME = i.OBJECT_NAME 
    AND s.INDEX_NAME = i.INDEX_NAME
WHERE s.TABLE_SCHEMA = 'your_database_name'
    AND i.INDEX_NAME IS NULL
    AND s.INDEX_NAME != 'PRIMARY';
```

#### 2. 索引优化建议
- **删除冗余索引**: 定期清理未使用的索引
- **复合索引顺序**: 按选择性从高到低排列
- **覆盖索引**: 对于频繁查询考虑包含所有需要的列
- **前缀索引**: 对于长字符串字段使用前缀索引

## 查询优化

### 多租户查询模式

#### 1. 强制项目隔离
所有业务查询必须包含`project_id`条件：

```sql
-- ✅ 正确的查询模式
SELECT * FROM mr_review_logs 
WHERE project_id = ? AND updated_at >= ? AND updated_at <= ?;

SELECT * FROM mr_review_logs 
WHERE project_id = ? AND author = ?;

SELECT * FROM push_review_logs 
WHERE project_id = ? AND branch = ?;

-- ❌ 错误的查询模式（缺少project_id）
SELECT * FROM mr_review_logs WHERE updated_at >= ?;  -- 会扫描所有项目
SELECT * FROM push_review_logs WHERE author = ?;     -- 跨项目查询
```

#### 2. 时间范围查询优化
使用复合索引优化时间范围查询：

```sql
-- 优化前：可能使用不当的索引
SELECT * FROM mr_review_logs 
WHERE updated_at BETWEEN ? AND ?
ORDER BY updated_at DESC
LIMIT 100;

-- 优化后：强制使用项目隔离
SELECT * FROM mr_review_logs 
WHERE project_id = ? 
    AND updated_at BETWEEN ? AND ?
ORDER BY updated_at DESC
LIMIT 100;

-- 进一步优化：使用覆盖索引
SELECT id, project_name, author, source_branch, target_branch, updated_at, score
FROM mr_review_logs 
WHERE project_id = ? 
    AND updated_at BETWEEN ? AND ?
ORDER BY updated_at DESC
LIMIT 100;
```

#### 3. 分页查询优化
避免大偏移量的性能问题：

```sql
-- ❌ 传统分页（大偏移量时性能差）
SELECT * FROM mr_review_logs 
WHERE project_id = ?
ORDER BY updated_at DESC
LIMIT 1000, 20;

-- ✅ 游标分页（性能稳定）
SELECT * FROM mr_review_logs 
WHERE project_id = ? 
    AND updated_at < ?  -- 上一页的最后一条记录的时间
ORDER BY updated_at DESC
LIMIT 20;

-- ✅ ID分页（最优性能）
SELECT * FROM mr_review_logs 
WHERE project_id = ? 
    AND id < ?  -- 上一页的最后一条记录的ID
ORDER BY id DESC
LIMIT 20;
```

### 应用层查询优化

#### 1. 项目名称到ID映射缓存
```python
class ProjectCache:
    def __init__(self):
        self._cache = {}
        self._last_update = None
        self._cache_ttl = 300  # 5分钟缓存
    
    def get_project_id(self, project_name: str) -> int:
        if self._should_refresh_cache():
            self._refresh_cache()
        return self._cache.get(project_name)
    
    def _refresh_cache(self):
        # 从数据库加载项目映射
        query = "SELECT id, name FROM projects WHERE status = 'active'"
        # 执行查询并更新缓存
        pass
```

#### 2. 批量查询优化
```python
# ❌ N+1查询问题
for project_name in project_names:
    logs = get_mr_logs_by_project(project_name, start_time, end_time)

# ✅ 批量查询
project_ids = [get_project_id(name) for name in project_names]
query = """
    SELECT * FROM mr_review_logs 
    WHERE project_id IN ({}) 
        AND updated_at BETWEEN ? AND ?
""".format(','.join(['?'] * len(project_ids)))
```

#### 3. 连接查询优化
```sql
-- ✅ 高效的连接查询
SELECT 
    ml.id,
    ml.author,
    ml.source_branch,
    ml.target_branch,
    ml.updated_at,
    ml.score,
    p.name as project_name
FROM mr_review_logs ml
INNER JOIN projects p ON p.id = ml.project_id
WHERE ml.project_id = ? 
    AND ml.updated_at >= ?
    AND p.status = 'active'
ORDER BY ml.updated_at DESC
LIMIT 100;
```

## 数据库配置优化

### MySQL服务器配置
```ini
[mysqld]
# 内存配置
innodb_buffer_pool_size = 4G  # 物理内存的70-80%
innodb_log_file_size = 512M
innodb_log_buffer_size = 64M

# 连接配置
max_connections = 200
thread_cache_size = 50

# 查询缓存（MySQL 5.7及以下）
query_cache_type = 1
query_cache_size = 256M

# InnoDB配置
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_file_per_table = 1

# 字符集
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci
```

### 连接池配置
```python
# 数据库连接池配置
DATABASE_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'app_user',
    'password': 'password',
    'database': 'ai_code_review',
    'charset': 'utf8mb4',
    'pool_size': 20,
    'max_overflow': 30,
    'pool_timeout': 30,
    'pool_recycle': 3600,
    'pool_pre_ping': True
}
```

## 分区策略

### 按项目分区
```sql
-- 创建分区表（适合大量项目场景）
CREATE TABLE mr_review_logs_partitioned (
    -- 字段定义与原表相同
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    -- ... 其他字段
) ENGINE=InnoDB
PARTITION BY HASH(project_id)
PARTITIONS 16;
```

### 按时间分区
```sql
-- 按月分区（适合历史数据归档）
CREATE TABLE mr_review_logs_by_month (
    -- 字段定义
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- ... 其他字段
) ENGINE=InnoDB
PARTITION BY RANGE (UNIX_TIMESTAMP(created_at)) (
    PARTITION p202401 VALUES LESS THAN (UNIX_TIMESTAMP('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (UNIX_TIMESTAMP('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (UNIX_TIMESTAMP('2024-04-01')),
    -- 添加更多分区
    PARTITION pfuture VALUES LESS THAN MAXVALUE
);
```

## 缓存策略

### Redis缓存配置
```python
import redis
import json
from typing import Optional

class CacheManager:
    def __init__(self):
        self.redis_client = redis.Redis(
            host='localhost',
            port=6379,
            db=0,
            decode_responses=True
        )
    
    def cache_project_config(self, project_id: int, config_type: str, config_data: dict):
        """缓存项目配置"""
        key = f"project:{project_id}:config:{config_type}"
        self.redis_client.setex(key, 1800, json.dumps(config_data))  # 30分钟缓存
    
    def get_project_config(self, project_id: int, config_type: str) -> Optional[dict]:
        """获取项目配置缓存"""
        key = f"project:{project_id}:config:{config_type}"
        cached_data = self.redis_client.get(key)
        return json.loads(cached_data) if cached_data else None
    
    def cache_review_stats(self, project_id: int, stats: dict):
        """缓存审查统计数据"""
        key = f"project:{project_id}:stats"
        self.redis_client.setex(key, 900, json.dumps(stats))  # 15分钟缓存
```

### 应用层缓存
```python
from functools import lru_cache
import time

class ReviewService:
    @lru_cache(maxsize=1000)
    def get_project_id_by_name(self, project_name: str) -> Optional[int]:
        """项目名称到ID映射缓存"""
        # 实现数据库查询
        pass
    
    def get_review_logs_with_cache(self, project_id: int, **kwargs):
        """带缓存的审查日志查询"""
        cache_key = self._build_cache_key(project_id, **kwargs)
        
        # 先尝试从缓存获取
        cached_result = self.cache_manager.get(cache_key)
        if cached_result:
            return cached_result
        
        # 缓存未命中，查询数据库
        result = self._query_review_logs(project_id, **kwargs)
        
        # 缓存结果
        self.cache_manager.set(cache_key, result, ttl=600)  # 10分钟缓存
        return result
```

## 监控和性能调优

### 关键性能指标
```sql
-- 慢查询监控
SELECT 
    query_time,
    lock_time,
    rows_sent,
    rows_examined,
    sql_text
FROM mysql.slow_log
WHERE start_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
ORDER BY query_time DESC
LIMIT 10;

-- 索引效率监控
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    NON_UNIQUE,
    INDEX_NAME,
    CARDINALITY,
    SUB_PART,
    NULLABLE,
    INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'your_database_name'
    AND CARDINALITY < 100;  -- 低选择性索引

-- 表空间使用监控
SELECT 
    TABLE_NAME,
    ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS 'Size in MB',
    ROUND((INDEX_LENGTH / 1024 / 1024), 2) AS 'Index Size in MB',
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'your_database_name'
ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC;
```

### 自动化性能优化
```python
class PerformanceMonitor:
    def check_slow_queries(self):
        """检查慢查询"""
        slow_queries = self._get_slow_queries()
        if len(slow_queries) > 10:
            self._alert_slow_queries(slow_queries)
    
    def analyze_index_usage(self):
        """分析索引使用情况"""
        unused_indexes = self._get_unused_indexes()
        if unused_indexes:
            self._suggest_index_cleanup(unused_indexes)
    
    def monitor_table_growth(self):
        """监控表增长"""
        large_tables = self._get_large_tables()
        for table in large_tables:
            if table['growth_rate'] > 0.2:  # 20%增长率
                self._suggest_archiving(table)
```

## 最佳实践总结

### 1. 查询设计原则
- **强制项目隔离**: 所有查询必须包含project_id
- **索引优先**: 确保查询能够使用适当的索引
- **避免全表扫描**: 使用EXPLAIN分析查询计划
- **限制结果集**: 使用LIMIT避免大量数据传输

### 2. 索引设计原则
- **多租户优先**: project_id作为复合索引第一列
- **选择性排序**: 按字段选择性从高到低排列
- **覆盖索引**: 对于频繁查询包含所有需要的列
- **定期维护**: 监控和清理无用索引

### 3. 缓存策略
- **分层缓存**: 应用层缓存 + Redis缓存
- **合理TTL**: 根据数据更新频率设置缓存时间
- **缓存预热**: 系统启动时预加载热点数据
- **缓存一致性**: 数据更新时及时失效缓存

### 4. 容量规划
- **数据归档**: 定期归档历史数据
- **分区策略**: 按项目或时间分区
- **读写分离**: 使用主从复制分离读写负载
- **水平扩展**: 考虑分库分表策略 
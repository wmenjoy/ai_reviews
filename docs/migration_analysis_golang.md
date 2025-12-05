# AI-Codereview-Gitlab Golang迁移与重构分析文档

## 目录
1. [项目概述](#项目概述)
2. [核心架构分析](#核心架构分析)
3. [数据库模型设计](#数据库模型设计)
4. [REST API设计](#rest-api设计)
5. [业务逻辑层](#业务逻辑层)
6. [Webhook处理引擎](#webhook处理引擎)
7. [AI代码评审引擎](#ai代码评审引擎)
8. [通知系统](#通知系统)
9. [多语言支持](#多语言支持)
10. [认证与授权系统](#认证与授权系统)
11. [UI界面设计](#ui界面设计)
12. [配置管理系统](#配置管理系统)
13. [迁移策略](#迁移策略)
14. [技术选型建议](#技术选型建议)

---

## 项目概述

AI-Codereview-Gitlab是一个企业级AI代码审查平台，提供：
- 多租户项目管理
- 支持GitLab和GitHub集成
- 多LLM提供商支持
- 多渠道通知
- RBAC权限控制
- 可视化管理界面

**当前技术栈：**
- Python 3.x
- Flask (Web框架)
- Streamlit (UI框架)
- MySQL/SQLite (数据库)
- Redis (可选缓存/队列)

**目标技术栈：**
- Go 1.21+
- Gin/Echo (Web框架)
- React/Vue (新UI框架)
- MySQL (数据库)
- Redis (缓存/队列)

---

## 核心架构分析

### 整体架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  GitLab     │     │  GitHub     │     │     UI      │
│  Webhook    │     │  Webhook    │     │  (React)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
┌──────▼───────────────────▼───────────────────▼──────┐
│              API Gateway (Gin)                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         Webhook Controller/Router            │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────┬───────────────────┬──────────────┘
                   │                   │
       ┌───────────▼──────────┐ ┌────▼──────────────┐
       │  Webhook Processor   │ │  REST API         │
       │  (ProjectAware)      │ │  Controllers      │
       └───────────┬──────────┘ └───────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│        Business Logic Layer (Services)              │
│  ┌────────────────────────────────────────────────┐ │
│  │  ProjectService  UserService  ReviewService    │ │
│  │  MemberService   ConfigService  AuthService    │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│         Data Access Layer (Repository)              │
│  ┌────────────────────────────────────────────────┐ │
│  │  MySQL (Projects, Users, Reviews, Configs)     │ │
│  │  Redis (Cache, Session, Queue)                 │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 微服务拆分建议

**核心服务：**
1. **webhook-service**: Webhook接收和处理
2. **api-service**: REST API接口
3. **review-engine**: AI审查引擎
4. **notification-service**: 通知服务
5. **ui-service**: 前端界面

---

## 数据库模型设计

### MySQL数据库Schema

#### projects表 (项目核心表)
```sql
CREATE TABLE `projects` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL UNIQUE COMMENT '项目名称',
    `description` TEXT COMMENT '项目描述',
    `webhook_url` VARCHAR(500) COMMENT 'Webhook URL',
    `webhook_secret` VARCHAR(255) COMMENT 'Webhook密钥',
    `status` ENUM('active', 'inactive', 'archived') DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_name` (`name`),
    INDEX `idx_status` (`status`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### users表 (用户管理)
```sql
CREATE TABLE `users` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `username` VARCHAR(100) NOT NULL UNIQUE,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL COMMENT 'BCrypt哈希',
    `full_name` VARCHAR(200),
    `role` ENUM('super_admin', 'system_admin', 'organization_admin', 'developer', 'viewer') DEFAULT 'developer',
    `status` ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    `last_login_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_username` (`username`),
    INDEX `idx_email` (`email`),
    INDEX `idx_role` (`role`),
    INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### project_users表 (多租户核心)
```sql
CREATE TABLE `project_users` (
    `project_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `role` ENUM('admin', 'developer', 'viewer') DEFAULT 'developer',
    `permissions` JSON COMMENT '自定义权限配置',
    `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`project_id`, `user_id`),
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### project_configs表 (项目配置)
```sql
CREATE TABLE `project_configs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `project_id` BIGINT NOT NULL,
    `config_type` ENUM('llm', 'notification', 'webhook', 'review_rules', 'general') NOT NULL,
    `config_data` JSON NOT NULL COMMENT 'AES加密的配置数据',
    `version` INT DEFAULT 1,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_by` BIGINT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `unique_project_config` (`project_id`, `config_type`),
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_project_type` (`project_id`, `config_type`),
    INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### mr_review_logs表 (MR审查日志)
```sql
CREATE TABLE `mr_review_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `project_id` BIGINT NOT NULL,
    `project_name` VARCHAR(255) NOT NULL,
    `author` VARCHAR(255) NOT NULL,
    `source_branch` VARCHAR(255) NOT NULL,
    `target_branch` VARCHAR(255) NOT NULL,
    `updated_at` BIGINT NOT NULL COMMENT 'Unix时间戳',
    `commit_messages` TEXT,
    `score` INT DEFAULT 0 COMMENT '0-100分',
    `url` VARCHAR(1000),
    `review_result` LONGTEXT COMMENT 'AI审查结果',
    `additions` INT DEFAULT 0,
    `deletions` INT DEFAULT 0,
    `last_commit_id` VARCHAR(100) DEFAULT '' COMMENT 'MR最后提交ID',
    `webhook_data` JSON,
    `review_status` ENUM('pending', 'completed', 'failed', 'skipped') DEFAULT 'completed',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
    INDEX `idx_project_updated_at` (`project_id`, `updated_at`),
    INDEX `idx_project_author` (`project_id`, `author`),
    INDEX `idx_project_branch` (`project_id`, `source_branch`, `target_branch`),
    INDEX `idx_last_commit` (`project_id`, `source_branch`, `target_branch`, `last_commit_id`),
    INDEX `idx_review_status` (`review_status`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### push_review_logs表 (Push审查日志)
```sql
CREATE TABLE `push_review_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `project_id` BIGINT NOT NULL,
    `project_name` VARCHAR(255) NOT NULL,
    `author` VARCHAR(255) NOT NULL,
    `branch` VARCHAR(255) NOT NULL,
    `updated_at` BIGINT NOT NULL COMMENT 'Unix时间戳',
    `commit_messages` TEXT,
    `score` INT DEFAULT 0 COMMENT '0-100分',
    `review_result` LONGTEXT COMMENT 'AI审查结果',
    `additions` INT DEFAULT 0,
    `deletions` INT DEFAULT 0,
    `webhook_data` JSON,
    `review_status` ENUM('pending', 'completed', 'failed', 'skipped') DEFAULT 'completed',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
    INDEX `idx_project_updated_at` (`project_id`, `updated_at`),
    INDEX `idx_project_author` (`project_id`, `author`),
    INDEX `idx_project_branch` (`project_id`, `branch`),
    INDEX `idx_review_status` (`review_status`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### webhooks表 (webhook日志)
```sql
CREATE TABLE `webhooks` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `project_id` BIGINT NOT NULL,
    `user_id` BIGINT,
    `event_id` VARCHAR(100) COMMENT 'GitHub/GitLab事件ID',
    `source` ENUM('gitlab', 'github') NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `status` ENUM('received', 'processing', 'completed', 'failed') DEFAULT 'received',
    `payload` JSON NOT NULL,
    `response` JSON,
    `processing_time_ms` INT,
    `error_message` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_project_event` (`project_id`, `event_type`),
    INDEX `idx_status` (`status`),
    INDEX `idx_created_at` (`created_at`),
    INDEX `idx_event_id` (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Redis数据结构设计

#### Session存储
```
Key: session:{session_id}
Type: Hash
TTL: 86400 (24小时)
Fields:
  - user_id: BIGINT
  - username: STRING
  - role: STRING
  - project_id: BIGINT (可选)
  - created_at: TIMESTAMP
```

#### 项目配置缓存
```
Key: config:{project_id}:{config_type}
Type: String
TTL: 300 (5分钟)
Value: AES加密的JSON配置
```

#### Webhook处理队列 (RQ模式)
```
Key: rq:queue:{gitlab_instance_id}
Type: List
Value: 序列化的任务数据

Key: rq:job:{job_id}
Type: Hash
Fields:
  - status: STRING (queued/started/finished/failed)
  - created_at: TIMESTAMP
  - started_at: TIMESTAMP
  - ended_at: TIMESTAMP
  - result: TEXT
  - exc_info: TEXT (错误信息)
```

#### 审计日志 (可选)
```
Key: audit:{user_id}:{timestamp}
Type: Hash
TTL: 2592000 (30天)
Fields:
  - action: STRING
  - resource: STRING
  - resource_id: BIGINT
  - ip_address: STRING
  - user_agent: STRING
  - result: STRING
```

---

## REST API设计

### API设计规范

**基础URL**: `/api/v1`
**认证方式**: JWT Bearer Token
**Content-Type**: `application/json`

### 认证API

#### 用户登录
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username_or_email": "admin",
  "password": "password123",
  "remember_me": false
}

Response 200 OK:
{
  "success": true,
  "token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "full_name": "Administrator"
  },
  "expires_in": 86400
}
```

#### 刷新Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGc..."
}

Response 200 OK:
{
  "success": true,
  "token": "eyJhbGc...",
  "expires_in": 86400
}
```

#### 获取当前用户信息
```http
GET /api/v1/auth/profile
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "full_name": "Administrator",
  "role": "admin",
  "status": "active",
  "last_login_at": "2025-01-01T12:00:00Z",
  "created_at": "2024-01-01T12:00:00Z"
}
```

### 项目管理API

#### 获取项目列表
```http
GET /api/v1/projects?page=1&page_size=20&status=active&search=keyword
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "projects": [
    {
      "id": 1,
      "name": "Project A",
      "description": "Description",
      "webhook_url": "https://...",
      "webhook_secret": "***",
      "status": "active",
      "member_count": 5,
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": "2024-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100,
    "pages": 5
  }
}
```

#### 创建项目
```http
POST /api/v1/projects
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "name": "New Project",
  "description": "Project description",
  "status": "active"
}

Response 201 Created:
{
  "id": 1,
  "name": "New Project",
  "webhook_url": "https://api.example.com/webhook/1",
  "webhook_secret": "random_secret",
  "status": "active",
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

#### 获取项目详情
```http
GET /api/v1/projects/{project_id}
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "id": 1,
  "name": "Project A",
  "description": "Description",
  "webhook_url": "https://...",
  "webhook_secret": "***",
  "status": "active",
  "members": [...],
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

### 项目成员管理API

#### 获取项目成员列表
```http
GET /api/v1/projects/{project_id}/members
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "members": [
    {
      "user_id": 1,
      "username": "user1",
      "full_name": "User One",
      "role": "admin",
      "permissions": {"can_review": true, "can_manage": true},
      "joined_at": "2024-01-01T12:00:00Z"
    }
  ],
  "total": 5
}
```

#### 添加项目成员
```http
POST /api/v1/projects/{project_id}/members
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "user_id": 2,
  "role": "developer",
  "permissions": {
    "can_review": true,
    "can_manage": false
  }
}

Response 201 Created:
{
  "user_id": 2,
  "role": "developer",
  "permissions": {"can_review": true, "can_manage": false},
  "joined_at": "2024-01-01T12:00:00Z"
}
```

### 项目配置管理API

#### 获取项目配置
```http
GET /api/v1/projects/{project_id}/configs/{config_type}
Authorization: Bearer eyJhbGc...

Query Parameters:
- env_fallback: bool (default: true) - 是否回退到环境变量

Response 200 OK:
{
  "project_id": 1,
  "config_type": "llm",
  "config_data": {
    "provider": "openai",
    "api_key": "***",
    "model": "gpt-4o-mini",
    "temperature": 0.3,
    "max_tokens": 10000
  },
  "version": 2,
  "is_active": true,
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

#### 更新项目配置
```http
PUT /api/v1/projects/{project_id}/configs/{config_type}
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "config_data": {
    "provider": "openai",
    "api_key": "sk-xxx",
    "model": "gpt-4o-mini"
  },
  "is_active": true
}

Response 200 OK:
{
  "success": true,
  "message": "Configuration updated successfully"
}
```

#### 测试配置连接
```http
POST /api/v1/projects/{project_id}/configs/{config_type}/test
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "success": true,
  "message": "Connection successful",
  "response_time_ms": 150
}
```

### 审查记录API

#### 获取MR审查记录
```http
GET /api/v1/projects/{project_id}/reviews/merge-requests?page=1&page_size=20&author=user&branch=main
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "reviews": [
    {
      "id": 1,
      "author": "user1",
      "source_branch": "feature/xxx",
      "target_branch": "main",
      "updated_at": 1704110400,
      "score": 85,
      "additions": 150,
      "deletions": 50,
      "review_status": "completed",
      "url": "https://gitlab.example.com/merge_requests/1",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 50,
    "pages": 3
  }
}
```

#### 获取Push审查记录
```http
GET /api/v1/projects/{project_id}/reviews/pushes?page=1&page_size=20&author=user&branch=main
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "reviews": [
    {
      "id": 1,
      "author": "user1",
      "branch": "main",
      "updated_at": 1704110400,
      "score": 78,
      "additions": 100,
      "deletions": 30,
      "review_status": "completed",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 30,
    "pages": 2
  }
}
```

### Webhook API

#### 接收GitLab Webhook
```http
POST /api/v1/webhook/{project_id}/gitlab
X-Gitlab-Token: {webhook_secret}
Content-Type: application/json

{
  "object_kind": "merge_request",
  "project": {"name": "Project A"},
  ...
}

Response 200 OK:
{
  "status": "success",
  "project_id": 1,
  "event_id": "evt_xxx",
  "message": "Merge request processing started",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 接收GitHub Webhook
```http
POST /api/v1/webhook/{project_id}/github
X-GitHub-Event: pull_request
X-Hub-Signature-256: sha256={signature}
Content-Type: application/json

{
  "action": "opened",
  "pull_request": {...},
  ...
}

Response 200 OK:
{
  "status": "success",
  "project_id": 1,
  "event_id": "evt_yyy",
  "message": "Pull request processing started",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 用户管理API

#### 获取用户列表
```http
GET /api/v1/users?page=1&page_size=20&role=developer&search=keyword
Authorization: Bearer eyJhbGc...

Response 200 OK:
{
  "users": [
    {
      "id": 1,
      "username": "user1",
      "email": "user1@example.com",
      "full_name": "User One",
      "role": "developer",
      "status": "active",
      "last_login_at": "2024-01-01T12:00:00Z",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

## 业务逻辑层

### 服务层架构设计

```
┌─────────────────────────────────────────┐
│      Service Layer (Business Logic)      │
├─────────────────────────────────────────┤
│                                          │
│  ┌──────────────────────────────────┐   │
│  │     ProjectService               │   │
│  │  - CRUD operations               │   │
│  │  - Webhook secret mgmt          │   │
│  │  - Member statistics             │   │
│  │  - Permission checks             │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│  ┌────────────▼─────────────────────┐   │
│  │     UserService                  │   │
│  │  - User lifecycle mgmt           │   │
│  │  - Role management               │   │
│  │  - Password hashing (BCrypt)     │   │
│  │  - Login tracking                │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│  ┌────────────▼─────────────────────┐   │
│  │     ReviewService                │   │
│  │  - MR review logs                │   │
│  │  - Push review logs              │   │
│  │  - Duplicate detection           │   │
│  │  - Score tracking                │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│  ┌────────────▼─────────────────────┐   │
│  │  ProjectMemberService            │   │
│  │  - RBAC management               │   │
│  │  - Role permissions              │   │
│  │  - Member lifecycle              │   │
│  │  - Custom permissions            │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│  ┌────────────▼─────────────────────┐   │
│  │  ProjectConfigService            │   │
│  │  - Config validation             │   │
│  │  - AES encryption                │   │
│  │  - Redis caching                 │   │
│  │  - Hot reload                    │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│  ┌────────────▼─────────────────────┐   │
│  │     AuthService                  │   │
│  │  - JWT token mgmt                │   │
│  │  - Password validation           │   │
│  │  - Logout handling               │   │
│  └────────────┬─────────────────────┘   │
│               │                          │
│  ┌────────────▼─────────────────────┐   │
│  │  WebhookService                  │   │
│  │  - Platform detection            │   │
│  │  - IP whitelist                  │   │
│  │  - Secret validation             │   │
│  │  - Rate limiting                 │   │
│  └──────────────────────────────────┘   │
│                                          │
└─────────────────────────────────────────┘
```

### 关键业务规则

#### 1. 重复提交检测
```go
// 基于项目+分支+最后提交ID的唯一性检查
func (s *ReviewService) CheckDuplicateReview(
    projectID int64,
    sourceBranch string,
    targetBranch string,
    lastCommitID string,
) (bool, error) {
    // 查询数据库检查是否已存在
}
```

#### 2. 权限检查逻辑
```go
// RBAC权限验证
func (s *ProjectMemberService) CheckPermission(
    userID int64,
    projectID int64,
    permission string,
) (bool, error) {
    // 1. 检查系统级角色权限
    // 2. 检查项目级角色权限
    // 3. 检查自定义权限配置
}
```

#### 3. 配置合并优先级
```go
// 配置加载顺序：DB > Redis Cache > Environment > Defaults
func (s *ProjectConfigService) LoadConfig(
    projectID int64,
    configType string,
) (map[string]interface{}, error) {
    // 1. 检查Redis缓存
    // 2. 查询数据库
    // 3. 解密敏感数据
    // 4. 合并环境变量
    // 5. 验证配置模式
}
```

#### 4. Webhook验证流程
```go
func (s *WebhookService) ValidateWebhook(
    projectID int64,
    signature string,
    payload []byte,
) error {
    // 1. 获取项目webhook secret
    // 2. 计算HMAC-SHA256签名
    // 3. 比较签名是否匹配
    // 4. 检查IP白名单（如果配置）
}
```

---

## Webhook处理引擎

### Webhook接收流程

```
┌─────────────┐
│  GitLab/    │
│  GitHub     │
└──────┬──────┘
       │
┌──────▼──────────────────────────────┐
│  Webhook Controller (Gin)          │
│  POST /webhook/{project_id}/:platform │
├──────────────────────────────────────┤
│ 1. 解析请求头和签名                   │
│ 2. 验证webhook secret                │
│ 3. 提取项目上下文                    │
└──────┬───────────────────────────────┘
       │
┌──────▼──────────────────────────────┐
│  Webhook Processor                   │
├──────────────────────────────────────┤
│ 4. 平台检测 (GitLab/GitHub)          │
│ 5. 事件类型识别                      │
│    - merge_request                   │
│    - pull_request                    │
│    - push                            │
└──────┬───────────────────────────────┘
       │
┌──────▼──────────────────────────────┐
│  Event Filter                        │
├──────────────────────────────────────┤
│ 6. 草稿检测 (draft/WIP)              │
│ 7. 分支保护检查                      │
│ 8. 重复提交检测                      │
│ 9. 文件扩展名过滤                    │
└──────┬───────────────────────────────┘
       │
┌──────▼──────────────────────────────┐
│  Job Queue (Redis/RQ)                │
├──────────────────────────────────────┤
│ 10. 创建异步任务                     │
│ 11. 入队等待处理                      │
└──────┬───────────────────────────────┘
       │
┌──────▼──────────────────────────────┐
│  Worker Process                      │
├──────────────────────────────────────┤
│ 12. 拉取任务                         │
│ 13. 获取代码变更 (Git API)           │
│ 14. 调用AI审查引擎                   │
│ 15. 提交审查结果 (Comment API)       │
│ 16. 发送通知                         │
│ 17. 记录日志                         │
└──────────────────────────────────────┘
```

### 支持的Webhook事件

#### GitLab事件
- `merge_request` (opened, updated, reopened)
- `push`

#### GitHub事件
- `pull_request` (opened, synchronize, reopened)
- `push`

### 事件处理逻辑

#### Merge Request事件处理
```go
func HandleMergeRequestEvent(
    ctx context.Context,
    projectID int64,
    webhookData map[string]interface{},
) error {
    // 1. 验证webhook数据完整性
    // 2. 检查项目配置
    // 3. 检查是否为草稿 (draft/WIP)
    // 4. 获取MR详情 (GitLab/GitHub API)
    // 5. 获取代码变更 (changes/diff)
    // 6. 调用AI审查服务
    // 7. 提交审查评论
    // 8. 触发通知事件
    // 9. 记录审查日志
}
```

#### Push事件处理
```go
func HandlePushEvent(
    ctx context.Context,
    projectID int64,
    webhookData map[string]interface{},
) error {
    // 1. 验证webhook数据完整性
    // 2. 检查项目配置
    // 3. 获取commits列表
    // 4. 获取代码diff (compare API)
    // 5. 调用AI审查服务
    // 6. 提交commit评论 (可选)
    // 7. 触发通知事件
    // 8. 记录审查日志
}
```

### 代码变更过滤

```go
// 支持的文件扩展名
var supportedExtensions = map[string]bool{
    ".java": true, ".py": true, ".php": true,
    ".js": true, ".jsx": true, ".ts": true, ".tsx": true,
    ".go": true, ".c": true, ".cpp": true, ".h": true,
    ".sql": true, ".vue": true, ".css": true, ".md": true,
}

// 过滤函数
func FilterChanges(changes []FileChange) []FileChange {
    filtered := make([]FileChange, 0)
    for _, change := range changes {
        // 跳过删除的文件
        if change.Deleted {
            continue
        }
        // 检查文件扩展名
        ext := strings.ToLower(filepath.Ext(change.NewPath))
        if supportedExtensions[ext] {
            filtered = append(filtered, change)
        }
    }
    return filtered
}
```

### 错误处理和重试机制

```go
// API调用重试策略
func CallWithRetry(ctx context.Context, fn func() error) error {
    const maxRetries = 3
    const retryDelay = 2 * time.Second

    var lastErr error
    for attempt := 1; attempt <= maxRetries; attempt++ {
        err := fn()
        if err == nil {
            return nil
        }
        lastErr = err

        // 检查错误类型
        if !isRetryableError(err) {
            return err
        }

        // 指数退避
        delay := time.Duration(math.Pow(2, float64(attempt-1))) * retryDelay
        time.Sleep(delay)
    }
    return fmt.Errorf("max retries exceeded: %w", lastErr)
}
```

---

## AI代码评审引擎

### 核心审查流程

```
┌────────────────────────────────────────┐
│  Code Review Engine                    │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ Diff Parser  │  │  Git API     │  │
│  │              │◄─┤  Client      │  │
│  │ - Parse diff │  └──────────────┘  │
│  │ - Extract    │                      │
│  │   changes    │                      │
│  │ - Filter     │                      │
│  │   files      │                      │
│  └──────┬───────┘                      │
│         │                              │
│  ┌──────▼──────────────────────┐      │
│  │  Prompt Builder             │      │
│  │                             │      │
│  │ 1. Load template from DB    │      │
│  │ 2. Render with Jinja2/Go    │      │
│  │    template                 │      │
│  │ 3. Truncate if > max_tokens │      │
│  └──────┬──────────────────────┘      │
│         │                              │
│  ┌──────▼──────────────────────┐      │
│  │  LLM Client Factory         │      │
│  │                             │      │
│  │ - OpenAI                    │      │
│  │ - Anthropic                 │      │
│  │ - DeepSeek                  │      │
│  │ - Qwen                      │      │
│  │ - ZhipuAI                   │      │
│  │ - Ollama                    │      │
│  └──────┬──────────────────────┘      │
│         │                              │
│  ┌──────▼──────────────────────┐      │
│  │  Response Parser            │      │
│  │                             │      │
│  │ 1. Extract score            │      │
│  │ 2. Clean markdown           │      │
│  │ 3. Handle thinking chains   │      │
│  └──────┬──────────────────────┘      │
│         │                              │
│  ┌──────▼──────────────────────┐      │
│  │  Result Composer            │      │
│  │                             │      │
│  │ - Format review result      │      │
│  │ - Prepare for notification  │      │
│  └─────────────────────────────┘      │
│                                        │
└────────────────────────────────────────┘
```

### 支持的LLM提供商

| 提供商 | 模型 | 特点 | 配置参数 |
|--------|------|------|----------|
| OpenAI | GPT-4o-mini | 完整重试机制,错误处理 | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| Anthropic | Claude-3-Haiku | 系统消息转换,温度限制 | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| DeepSeek | deepseek-chat | OpenAI兼容 | `DEEPSEEK_API_KEY` |
| Qwen | qwen-coder-plus | 禁用思考模式 | `QWEN_API_KEY` |
| ZhipuAI | GLM-4-Flash | 简洁接口 | `ZHIPUAI_API_KEY` |
| Ollama | deepseek-r1 | 本地部署,思考链 | `OLLAMA_BASE_URL` |

### Java企业级审查模板

**评分维度 (100分制):**

```yaml
system_prompt: |-
  你是一位资深的Java软件开发工程师...

  ### 代码审查目标：
  1. 功能实现的正确性与健壮性（30分）
  2. 安全性与潜在风险（20分）
  3. 资源管理与配置规范（10分）
  4. 并发安全与线程安全（10分）
  5. 性能优化与数据库规范（10分）
  6. 日志与监控规范（5分）
  7. 配置管理与环境安全（5分）

  ### 资源管理重点检查：
  - 线程池配置（coreSize, maxSize, queueCapacity）
  - 数据库连接池（minIdle, maxActive）
  - Redis连接池配置
```

**审查风格模板:**

```go
const UserPromptTemplate = `
以下是某位员工向 GitLab 代码库提交的代码，请以{{ .Style }}风格进行专业的企业级代码审查。

代码变更内容：
{{ .DiffsText }}

提交历史：
{{ .CommitsText }}

请提供详细的代码审查建议，包括问题识别、改进建议和评分（满分100分）。
`
```

### Token管理和截断

```go
const (
    MaxReviewTokens = 10000
    ReservedTokens  = 500 // 保留给提示词
)

type TokenManager struct {
    encoder *tiktoken.Tiktoken
}

func (tm *TokenManager) TruncateText(text string, maxTokens int) string {
    tokens := tm.encoder.Encode(text, nil, nil)
    if len(tokens) <= maxTokens {
        return text
    }
    truncated := tokens[:maxTokens]
    return tm.encoder.Decode(truncated)
}
```

### 评分解析

```go
var scorePatterns = []*regexp.Regexp{
    regexp.MustCompile(`\*\*总分\*\*:?\s*(\d+)分?`),
    regexp.MustCompile(`总分[:：]\s*(\d+)分?`),
    regexp.MustCompile(`评分[:：]\s*(\d+)/100`),
}

func ParseReviewScore(reviewText string) int {
    for _, pattern := range scorePatterns {
        matches := pattern.FindStringSubmatch(reviewText)
        if len(matches) >= 2 {
            if score, err := strconv.Atoi(matches[1]); err == nil {
                return score
            }
        }
    }
    return 0
}
```

---

## 通知系统

### 多渠道通知架构

```
┌─────────────────────────────────────────┐
│  ProjectNotificationService             │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Config Manager                  │  │
│  │  - Load project config           │  │
│  │  - Cache (5 min TTL)             │  │
│  │  - Encrypt/Decrypt               │  │
│  └────────────┬─────────────────────┘  │
│               │                         │
│  ┌────────────▼─────────────────────┐  │
│  │  Channel Router                  │  │
│  │                                  │  │
│  │  DingTalk → DingTalkNotifier     │  │
│  │  Feishu   → FeishuNotifier       │  │
│  │  WeCom    → WeComNotifier        │  │
│  │  Webhook  → ExtraWebhookNotifier │  │
│  └────────────┬─────────────────────┘  │
│               │                         │
│  ┌────────────▼─────────────────────┐  │
│  │  Event Manager                   │  │
│  │  - merge_request_reviewed        │  │
│  │  - push_reviewed                 │  │
│  │  - webhook_received              │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 钉钉通知 (DingTalk)

**特性:**
- Webhook URL + HMAC-SHA256签名
- 支持@手机号和@用户ID
- Text和Markdown格式

**配置:**
```go
type DingTalkConfig struct {
    WebhookURL     string   `json:"webhook_url"`
    AccessToken    string   `json:"access_token,omitempty"`
    Secret         string   `json:"secret,omitempty"`
    AtMobiles      []string `json:"at_mobiles,omitempty"`
    AtUserIDs      []string `json:"at_user_ids,omitempty"`
    IsAtAll        bool     `json:"is_at_all,omitempty"`
}
```

**消息模板:**
```markdown
### 🔀 ProjectA: Merge Request

**提交者:** user1
**源分支**: feature/xxx
**目标分支**: main
**审查得分**: 85/100

**AI Review 结果:**
{review_result}
```

### 飞书通知 (Feishu)

**特性:**
- Interactive card format
- 蓝色彩色主题
- 自适应文本大小

**配置:**
```go
type FeishuConfig struct {
    WebhookURL string `json:"webhook_url"`
}
```

### 企业微信通知 (WeCom)

**特性:**
- 消息长度智能分割 (Text: 2048 bytes, Markdown: 4096 bytes)
- 支持@用户列表
- UTF-8安全截断

**配置:**
```go
type WeComConfig struct {
    WebhookURL         string   `json:"webhook_url"`
    CorpID            string   `json:"corp_id,omitempty"`
    CorpSecret        string   `json:"corp_secret,omitempty"`
    AgentID           string   `json:"agent_id,omitempty"`
    MentionedList     []string `json:"mentioned_list,omitempty"`
    MentionedMobile   []string `json:"mentioned_mobile_list,omitempty"`
}
```

### 自定义Webhook通知

```go
type ExtraWebhookConfig struct {
    URL     string            `json:"url"`
    Method  string            `json:"method"` // POST/PUT
    Headers map[string]string `json:"headers,omitempty"`
    Timeout int               `json:"timeout,omitempty"`
}
```

**Payload格式:**
```json
{
  "ai_codereview_data": {
    "content": "消息内容",
    "msg_type": "merge_request|push",
    "title": "ProjectA: Merge Request",
    "project_name": "ProjectA",
    "project_id": 1,
    "score": 85,
    "review_result": "..."
  },
  "webhook_data": { /* 原始webhook数据 */ }
}
```

### 通知事件类型

```go
const (
    EventMergeRequestReviewed = "merge_request_reviewed"
    EventPushReviewed         = "push_reviewed"
    EventWebhookReceived      = "webhook_received"
    EventDraftMRSkipped       = "draft_mr_skipped"
    EventReviewFailed         = "review_failed"
)
```

### 静默时间设置

```go
type QuietHoursConfig struct {
    Enabled    bool   `json:"enabled"`
    StartTime  string `json:"start_time"` // "22:00"
    EndTime    string `json:"end_time"`   // "08:00"
    Timezone   string `json:"timezone"`   // "Asia/Shanghai"
}

func (c QuietHoursConfig) ShouldSuppress() bool {
    if !c.Enabled {
        return false
    }
    now := time.Now()
    loc, _ := time.LoadLocation(c.Timezone)
    current := now.In(loc)
    currentStr := current.Format("15:04")

    // 判断当前时间是否在静默时间段内
    return currentStr >= c.StartTime || currentStr < c.EndTime
}
```

---

## 认证与授权系统

### JWT认证

```go
type JWTService struct {
    secretKey     []byte
    expiryHours   time.Duration
    refreshExpiry time.Duration
}

type Claims struct {
    UserID   int64  `json:"user_id"`
    Username string `json:"username"`
    Role     string `json:"role"`
    jwt.RegisteredClaims
}

func (s *JWTService) GenerateToken(user *User) (string, error) {
    claims := &Claims{
        UserID:   user.ID,
        Username: user.Username,
        Role:     user.Role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.expiryHours)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
        },
    }

    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(s.secretKey)
}

func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{},
        func(token *jwt.Token) (interface{}, error) {
            return s.secretKey, nil
        },
    )

    if claims, ok := token.Claims.(*Claims); ok && token.Valid {
        return claims, nil
    }
    return nil, err
}
```

### RBAC权限模型

```go
type Role string

const (
    RoleSuperAdmin       Role = "super_admin"
    RoleSystemAdmin      Role = "system_admin"
    RoleOrganizationAdmin Role = "organization_admin"
    RoleDeveloper        Role = "developer"
    RoleViewer           Role = "viewer"
)

type Permission string

const (
    PermViewProject    Permission = "view_project"
    PermManageProject  Permission = "manage_project"
    PermManageMembers  Permission = "manage_members"
    PermViewConfig     Permission = "view_config"
    PermManageConfig   Permission = "manage_config"
    PermViewWebhooks   Permission = "view_webhooks"
    PermManageWebhooks Permission = "manage_webhooks"
    PermViewReviews    Permission = "view_reviews"
    PermManageUsers    Permission = "manage_users"
    PermSystemConfig   Permission = "system_config"
)

// 系统级角色权限映射
var systemRolePermissions = map[Role][]Permission{
    RoleSuperAdmin: {
        PermViewProject, PermManageProject, PermManageMembers,
        PermViewConfig, PermManageConfig, PermViewWebhooks,
        PermManageWebhooks, PermViewReviews, PermManageUsers,
        PermSystemConfig,
    },
    RoleSystemAdmin: {
        PermViewProject, PermManageProject, PermManageMembers,
        PermViewConfig, PermManageConfig, PermViewWebhooks,
        PermManageWebhooks, PermViewReviews, PermManageUsers,
    },
    RoleOrganizationAdmin: {
        PermViewProject, PermManageProject, PermManageMembers,
        PermViewConfig, PermManageConfig, PermViewWebhooks,
        PermViewReviews,
    },
    RoleDeveloper: {
        PermViewProject, PermViewConfig, PermViewWebhooks,
        PermViewReviews,
    },
    RoleViewer: {
        PermViewProject, PermViewReviews,
    },
}

// 项目级角色权限映射
var projectRolePermissions = map[Role][]Permission{
    RoleAdmin: {
        PermViewProject, PermManageProject, PermManageMembers,
        PermViewConfig, PermManageConfig, PermViewWebhooks,
        PermManageWebhooks, PermViewReviews,
    },
    RoleDeveloper: {
        PermViewProject, PermViewConfig, PermViewWebhooks,
        PermViewReviews,
    },
    RoleViewer: {
        PermViewProject, PermViewReviews,
    },
}
```

### 密码安全

```go
import "golang.org/x/crypto/bcrypt"

type PasswordService struct {
    cost int
}

func NewPasswordService() *PasswordService {
    return &PasswordService{cost: bcrypt.DefaultCost}
}

func (s *PasswordService) HashPassword(password string) (string, error) {
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), s.cost)
    return string(bytes), err
}

func (s *PasswordService) CheckPassword(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}

func (s *PasswordService) ValidatePassword(password string) error {
    if len(password) < 8 {
        return errors.New("密码长度至少8位")
    }
    if len(password) > 64 {
        return errors.New("密码长度不能超过64位")
    }
    // 检查复杂度 (数字、大小写字母、特殊字符)
    // ...
    return nil
}
```

### 安全配置

```go
type SecurityConfig struct {
    JWTSecret               string        `json:"jwt_secret"`
    JWTExpiryHours          int           `json:"jwt_expiry_hours"`
    PasswordMinLength       int           `json:"password_min_length"`
    PasswordMaxLength       int           `json:"password_max_length"`
    SessionTimeout          time.Duration `json:"session_timeout"`
    MaxLoginAttempts        int           `json:"max_login_attempts"`
    LockoutDuration         time.Duration `json:"lockout_duration"`
    AESKey                  string        `json:"aes_key"`
    EnableIPWhitelist       bool          `json:"enable_ip_whitelist"`
    AllowedIPRanges         []string      `json:"allowed_ip_ranges"`
    CORSAllowedOrigins      []string      `json:"cors_allowed_origins"`
    EnableSecurityHeaders   bool          `json:"enable_security_headers"`
}
```

---

## UI界面设计

### 前端技术栈建议

```
React 18+ (推荐) 或 Vue 3+ (可选)
├── TypeScript (类型安全)
├── Vite (构建工具)
├── Ant Design / Element Plus (UI组件)
├── Axios (HTTP客户端)
├── React Query / SWR (数据获取)
├── Zustand / Redux (状态管理)
├── React Router / Vue Router (路由)
└── ECharts (图表可视化)
```

### 页面结构设计

```
┌─────────────────────────────────────────┐
│  Header                                  │
│  ┌─────────────┬──────────────────────┐ │
│  │ Logo        │ UserMenu ┊ Logout   │ │
│  └─────────────┴──────────────────────┘ │
├─────────────────────────────────────────┤
│                                          │
│  ┌──────────┬──────────────────────────┐ │
│  │ Sidebar  │  Main Content           │ │
│  │          │                         │ │
│  │ Dashboard├─────────────────────────┤ │
│  │ Projects │  Router-based Pages:    │ │
│  │ ├── List │  - Dashboard            │ │
│  │ ├── New  │  - Project Management  │ │
│  │ Users    │  - User Management     │ │
│  │ ├── List │  - Configuration       │ │
│  │ ├── New  │  - Statistics          │ │
│  │ Settings │  - Audit Logs          │ │
│  └──┬───────┘                         │ │
│     └─────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 核心页面功能

#### 1. Dashboard (仪表盘)
- 项目统计卡片
- 最近审查记录
- 评分趋势图表
- 活跃项目列表

#### 2. 项目管理
**项目列表页面:**
- 搜索和过滤
- 分页展示
- 快速操作 (编辑/删除)

**项目详情页面:**
- 基本信息展示
- 成员管理
- Webhook配置
- 审查历史

**创建/编辑项目:**
- 表单验证
- Webhook密钥生成
- 配置文件预览

#### 3. 用户管理
**用户列表:**
- 角色过滤
- 状态筛选
- 批量操作

**用户详情:**
- 基本信息
- 项目成员关系
- 操作日志

#### 4. 统计分析
**审查统计:**
- 按项目统计
- 按用户统计
- 按时间范围统计
- 代码变更趋势

**图表组件:**
- 柱状图 (提交次数)
- 折线图 (评分趋势)
- 饼图 (分布统计)
- 表格 (详细数据)

#### 5. 配置管理
**系统配置:**
- 数据库配置
- LLM提供商配置
- 通知渠道配置
- 安全配置

**项目配置:**
- LLM参数配置
- 通知规则配置
- Webhook设置
- 审查规则配置

### API客户端封装

```typescript
// api/client.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

class APIClient {
  private client: AxiosInstance;

  constructor(baseURL: string, token?: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // 统一错误处理
        if (error.response?.status === 401) {
          // Token过期处理
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // 认证API
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.post('/auth/login', credentials);
    return response.data;
  }

  async getProfile(): Promise<User> {
    const response = await this.client.get('/auth/profile');
    return response.data;
  }

  // 项目API
  async getProjects(params: ProjectQuery): Promise<PaginatedResponse<Project>> {
    const response = await this.client.get('/projects', { params });
    return response.data;
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    const response = await this.client.post('/projects', data);
    return response.data;
  }

  // 审查记录API
  async getMergeRequestReviews(
    projectId: number,
    params: ReviewQuery
  ): Promise<PaginatedResponse<Review>> {
    const response = await this.client.get(
      `/projects/${projectId}/reviews/merge-requests`,
      { params }
    );
    return response.data;
  }

  // 配置API
  async getProjectConfig(
    projectId: number,
    configType: string
  ): Promise<ProjectConfig> {
    const response = await this.client.get(
      `/projects/${projectId}/configs/${configType}`
    );
    return response.data;
  }

  async updateProjectConfig(
    projectId: number,
    configType: string,
    data: UpdateConfigRequest
  ): Promise<void> {
    await this.client.put(
      `/projects/${projectId}/configs/${configType}`,
      data
    );
  }
}

export default APIClient;
```

### 权限控制实现

```typescript
// hooks/usePermission.ts
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export const usePermission = () => {
  const { user } = useContext(AuthContext);

  const hasPermission = (permission: string, projectId?: number): boolean => {
    if (!user) return false;

    // 系统级权限检查
    const systemPerms = systemRolePermissions[user.role];
    if (systemPerms?.includes(permission)) {
      return true;
    }

    // 项目级权限检查
    if (projectId && user.projectRoles?.[projectId]) {
      const projectPerms = projectRolePermissions[user.projectRoles[projectId]];
      return projectPerms?.includes(permission) || false;
    }

    return false;
  };

  const hasAnyPermission = (permissions: string[], projectId?: number): boolean => {
    return permissions.some(p => hasPermission(p, projectId));
  };

  const hasAllPermissions = (permissions: string[], projectId?: number): boolean => {
    return permissions.every(p => hasPermission(p, projectId));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
};

// components/PermissionGuard.tsx
import React from 'react';
import { usePermission } from '../hooks/usePermission';

interface PermissionGuardProps {
  permission: string | string[];
  projectId?: number;
  all?: boolean; // true = all permissions required, false = any permission
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

const PermissionGuard: React.FC<PermissionGuardProps> = ({
  permission,
  projectId,
  all = false,
  fallback = null,
  children,
}) => {
  const { hasAnyPermission, hasAllPermissions } = usePermission();

  const hasAccess = Array.isArray(permission)
    ? all
      ? hasAllPermissions(permission, projectId)
      : hasAnyPermission(permission, projectId)
    : hasPermission(permission, projectId);

  return <>{hasAccess ? children : fallback}</>;
};

export default PermissionGuard;
```

### 状态管理

```typescript
// store/projectStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import APIClient from '../api/client';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;
  error: string | null;
  pagination: Pagination;

  // Actions
  fetchProjects: (params?: ProjectQuery) => Promise<void>;
  setCurrentProject: (project: Project) => void;
  createProject: (data: CreateProjectRequest) => Promise<void>;
  updateProject: (id: number, data: UpdateProjectRequest) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;

  // Selectors
  getProjectById: (id: number) => Project | null;
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      (set, get) => ({
        projects: [],
        currentProject: null,
        loading: false,
        error: null,
        pagination: { page: 1, pageSize: 20, total: 0, pages: 0 },

        fetchProjects: async (params) => {
          set({ loading: true, error: null });
          try {
            const response = await apiClient.getProjects(params);
            set({
              projects: response.projects,
              pagination: response.pagination,
              loading: false,
            });
          } catch (error) {
            set({ error: error.message, loading: false });
          }
        },

        setCurrentProject: (project) => {
          set({ currentProject: project });
          // 持久化到localStorage
          localStorage.setItem('currentProject', JSON.stringify(project));
        },

        // ... 其他actions
      }),
      {
        name: 'project-storage',
        partialize: (state) => ({ currentProject: state.currentProject }),
      }
    )
  )
);
```

---

## 配置管理系统

### 配置层次结构

```
配置优先级（从高到低）：
├─ 命令行参数
├─ 环境变量
├─ 配置文件 (config.yml)
├─ 默认值
└─ 数据库配置 (项目级)
```

### 环境变量配置

```bash
# Database
DATABASE_MODE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=ai_code_review
MYSQL_POOL_SIZE=20

# Redis (可选)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# LLM Provider
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_API_MODEL=gpt-4o-mini
OPENAI_API_BASE_URL=https://api.openai.com/v1

# GitLab/GitHub
GITLAB_ACCESS_TOKEN=glpat-...
GITHUB_ACCESS_TOKEN=ghp_...

# Notification
DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send
DINGTALK_SECRET=...

FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/...

WECOM_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...

# Security
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=secure_password
JWT_SECRET=your_jwt_secret_here_min_32_chars
JWT_EXPIRY_HOURS=24

# Review Settings
SUPPORTED_EXTENSIONS=.java,.py,.php,.js,.ts,.go
REVIEW_MAX_TOKENS=10000
REVIEW_STYLE=professional
REVIEW_PASS_SCORE=60
```

### 配置文件结构 (config.yml)

```yaml
# Server Configuration
server:
  port: 8080
  host: 0.0.0.0
  read_timeout: 30s
  write_timeout: 30s
  max_header_bytes: 1048576

# Database Configuration
database:
  mode: mysql  # mysql or sqlite
  mysql:
    host: ${MYSQL_HOST}
    port: ${MYSQL_PORT}
    user: ${MYSQL_USER}
    password: ${MYSQL_PASSWORD}
    database: ${MYSQL_DATABASE}
    max_open_conns: 20
    max_idle_conns: 5
    conn_max_lifetime: 300s
  sqlite:
    path: ./data/ai_code_review.db

# Redis Configuration (optional)
redis:
  enabled: true
  host: ${REDIS_HOST}
  port: ${REDIS_PORT}
  password: ${REDIS_PASSWORD}
  db: 0
  pool_size: 10
  min_idle_conns: 3
  max_retries: 3

# LLM Providers
llm:
  default_provider: ${LLM_PROVIDER}

  openai:
    api_key: ${OPENAI_API_KEY}
    model: ${OPENAI_API_MODEL}
    base_url: ${OPENAI_API_BASE_URL}
    temperature: 0.3
    max_tokens: 10000
    max_retries: 3
    timeout: 120s

  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
    model: ${ANTHROPIC_MODEL}
    temperature: 0.3
    max_tokens: 8192
    timeout: 120s

  deepseek:
    api_key: ${DEEPSEEK_API_KEY}
    model: ${DEEPSEEK_API_MODEL}
    base_url: ${DEEPSEEK_API_BASE_URL}
    temperature: 0.3
    max_tokens: 10000

  qwen:
    api_key: ${QWEN_API_KEY}
    model: ${QWEN_API_MODEL}
    base_url: ${QWEN_API_BASE_URL}
    enable_thinking: false

  zhipuai:
    api_key: ${ZHIPUAI_API_KEY}
    model: ${ZHIPUAI_API_MODEL}

  ollama:
    base_url: ${OLLAMA_BASE_URL}
    model: ${OLLAMA_API_MODEL}
    timeout: 300s

# Git Integration
git:
  gitlab:
    api_url: ${GITLAB_API_URL}
    access_token: ${GITLAB_ACCESS_TOKEN}
    timeout: 30s
  github:
    api_url: ${GITHUB_API_URL}
    access_token: ${GITHUB_ACCESS_TOKEN}
    timeout: 30s

# Notification Channels
notification:
  dingtalk:
    enabled: ${DINGTALK_ENABLED}
    webhook_url: ${DINGTALK_WEBHOOK_URL}
    access_token: ${DINGTALK_ACCESS_TOKEN}
    secret: ${DINGTALK_SECRET}
    at_mobiles: []
    at_user_ids: []

  feishu:
    enabled: ${FEISHU_ENABLED}
    webhook_url: ${FEISHU_WEBHOOK_URL}

  wecom:
    enabled: ${WECOM_ENABLED}
    webhook_url: ${WECOM_WEBHOOK_URL}
    corp_id: ${WECOM_CORP_ID}
    corp_secret: ${WECOM_CORP_SECRET}
    agent_id: ${WECOM_AGENT_ID}
    mentioned_list: []
    mentioned_mobile_list: []

# Security
security:
  jwt_secret: ${JWT_SECRET}
  jwt_expiry_hours: ${JWT_EXPIRY_HOURS}
  session_timeout: 24h
  password_policy:
    min_length: 8
    max_length: 64
    require_uppercase: true
    require_lowercase: true
    require_numbers: true
    require_special_chars: true
  cors:
    enabled: true
    allowed_origins:
      - http://localhost:3000
      - https://*.example.com
  rate_limit:
    enabled: true
    requests_per_minute: 60
    burst_size: 10

# Review Settings
review:
  supported_extensions: ${SUPPORTED_EXTENSIONS}
  max_tokens: ${REVIEW_MAX_TOKENS}
  style: ${REVIEW_STYLE}  # professional, sarcastic, gentle, humorous
  pass_score: ${REVIEW_PASS_SCORE}
  prompt_key: java_review  # prompt template key
  quiet_hours:
    enabled: true
    start_time: "22:00"
    end_time: "08:00"
    timezone: "Asia/Shanghai"
  duplicate_check:
    enabled: true
    check_window: 24h
  draft_detection:
    enabled: true
    skip_patterns:
      - "^draft"
      - "^WIP"
      - "^\[WIP\]"

# Queue Configuration
queue:
  driver: redis  # redis or memory
  redis:
    queue_names:
      - "webhook:gitlab"
      - "webhook:github"
    max_workers: 10
    job_timeout: 300s
    result_ttl: 3600s
  memory:
    max_workers: 5
    job_timeout: 300s

# Logging
logging:
  level: info  # debug, info, warn, error
  format: json  # json or text
  output: stdout  # stdout, file, or both
  file:
    path: ./logs/app.log
    max_size_mb: 100
    max_backups: 10
    max_age_days: 30
    compress: true
```

---

## 迁移策略

### 阶段一：基础架构搭建 (2-3周)

**目标：** 搭建Go项目基础架构，完成核心模块开发

1. **项目初始化**
   - 创建Go module (`github.com/your-org/ai-codereview-golang`)
   - 设置目录结构
   - 配置Makefile
   - Docker开发环境

2. **核心模块开发**
   ```
   - pkg/
     - database/ (MySQL连接池, GORM配置)
     - redis/ (Redis客户端, 连接池)
     - config/ (配置加载, 环境变量)
     - logger/ (日志框架, Zap)
     - errors/ (错误处理, 自定义错误类型)
     - utils/ (工具函数, 加密, JWT)
   ```

3. **数据库迁移**
   - 创建数据库schema
   - 数据迁移工具
   - 测试数据导入

### 阶段二：业务逻辑迁移 (4-6周)

**目标：** 迁移核心业务逻辑

1. **业务服务层**
   ```
   - internal/
     - service/
       - project.go
       - user.go
       - review.go
       - member.go
       - config.go
       - auth.go
       - webhook.go
       - notification.go
   ```

2. **领域模型**
   ```
   - internal/
     - model/
       - project.go
       - user.go
       - review.go
       - config.go
     - repository/
       - project_repository.go
       - user_repository.go
       - review_repository.go
   ```

3. **LLM集成**
   ```
   - internal/
     - llm/
       - client.go (接口定义)
       - openai.go
       - anthropic.go
       - factory.go
       - prompt.go
   ```

### 阶段三：API层开发 (3-4周)

**目标：** 实现REST API

1. **Web框架集成**
   - Gin框架配置
   - 中间件 (日志, 认证, CORS, 限流)
   - 路由分组

2. **Controller层**
   ```
   - internal/
     - controller/
       - auth_controller.go
       - project_controller.go
       - user_controller.go
       - review_controller.go
       - webhook_controller.go
       - config_controller.go
   ```

3. **请求/响应DTO**
   ```
   - internal/
     - dto/
       - request/
       - response/
   ```

### 阶段四：Webhook和Worker (2-3周)

**目标：** Webhook处理和异步任务

1. **Webhook处理器**
   ```
   - internal/
     - webhook/
       - gitlab_handler.go
       - github_handler.go
       - processor.go
       - validator.go
   ```

2. **异步任务队列**
   ```
   - internal/
     - worker/
       - worker.go
       - review_job.go
       - notification_job.go
   ```

3. **队列管理**
   - Redis Queue (RQ模式)
   - 任务调度
   - 重试机制

### 阶段五：通知系统 (2-3周)

**目标：** 多渠道通知集成

```
- internal/
  - notification/
    - notifier.go (接口)
    - dingtalk.go
    - feishu.go
    - wecom.go
    - webhook.go
    - service.go
```

### 阶段六：前端重构 (4-6周)

**目标：** 新UI界面

1. **React应用初始化**
   - Create React App / Vite
   - TypeScript配置
   - 路由配置

2. **组件开发**
   - 公共组件 (Header, Sidebar, Pagination)
   - 业务组件 (ProjectCard, UserForm)
   - 图表组件

3. **页面开发**
   - Dashboard
   - Project Management
   - User Management
   - Statistics

4. **集成测试**
   - API集成
   - 端到端测试

### 阶段七：集成测试和部署 (2-3周)

**目标：** 完整系统测试和部署

1. **测试**
   - 单元测试
   - 集成测试
   - 性能测试
   - 安全测试

2. **部署**
   - Docker镜像
   - Docker Compose
   - Kubernetes配置
   - CI/CD流水线

3. **监控和日志**
   - Prometheus指标
   - Grafana仪表板
   - ELK日志收集

### 数据迁移方案

#### 从Python到Go的数据迁移

```go
// migration/python_to_go.go
package migration

import (
    "database/sql"
    "encoding/json"
    "fmt"
    _ "github.com/mattn/go-sqlite3"
    "gorm.io/gorm"
)

type PythonDataMigrator struct {
    sqliteDB *sql.DB
    mysqlDB  *gorm.DB
}

func (m *PythonDataMigrator) Migrate() error {
    // 1. 连接SQLite数据库
    db, err := sql.Open("sqlite3", "./data/ai_code_review.db")
    if err != nil {
        return err
    }
    m.sqliteDB = db
    defer db.Close()

    // 2. 读取Python项目数据
    projects, err := m.readPythonProjects()
    if err != nil {
        return err
    }

    // 3. 转换为Go模型
    for _, pythonProject := range projects {
        goProject := &model.Project{
            Name:          pythonProject.ProjectName,
            Description:   pythonProject.Description,
            WebhookURL:    pythonProject.WebhookURL,
            WebhookSecret: generateRandomSecret(),
            Status:        "active",
        }

        // 4. 保存到MySQL
        if err := m.mysqlDB.Create(goProject).Error; err != nil {
            return err
        }

        // 5. 迁移审查记录
        if err := m.migrateReviewLogs(pythonProject.ProjectName, goProject.ID); err != nil {
            return err
        }
    }

    return nil
}
```

---

## 技术选型建议

### 后端技术栈

| 组件 | 推荐方案 | 备选方案 | 说明 |
|------|----------|----------|------|
| Web框架 | Gin | Echo | Gin性能更好，生态更成熟 |
| ORM | GORM | Bun, sqlx | GORM功能完整，文档丰富 |
| 数据库连接池 | 标准库 + GORM | sqlx | GORM内置连接池管理 |
| Redis客户端 | go-redis | redigo | go-redis更现代化 |
| JWT库 | jwt-go | jwt | 社区维护完善 |
| 密码哈希 | bcrypt | argon2 | bcrypt标准且安全 |
| 配置管理 | viper | koanf | viper生态成熟 |
| 日志框架 | Zap | zerolog | Zap性能优秀 |
| 验证库 | validator | go-playground | 功能完整 |
| 任务队列 | asynq | machinery | asynq基于Redis |
| 加密 | crypto/aes | - | Go标准库 |

### 前端技术栈

| 组件 | 推荐方案 | 说明 |
|------|----------|------|
| 框架 | React 18 + TypeScript | 类型安全，生态成熟 |
| 构建工具 | Vite | 快速，配置简单 |
| UI组件 | Ant Design 5 | 企业级组件库 |
| 状态管理 | Zustand | 轻量，易用 |
| 数据获取 | React Query | 缓存，自动刷新 |
| 路由 | React Router 6 | 功能完整 |
| 图表 | ECharts + echarts-for-react | 丰富图表类型 |
| 表单 | React Hook Form | 性能优秀 |
| HTTP客户端 | Axios | 拦截器，错误处理 |

### 基础设施

| 组件 | 推荐方案 | 说明 |
|------|----------|------|
| 容器化 | Docker + Docker Compose | 开发部署方便 |
| 编排 | Kubernetes | 生产环境推荐 |
| CI/CD | GitHub Actions / GitLab CI | 自动化流水线 |
| 监控 | Prometheus + Grafana | 指标收集和展示 |
| 日志 | ELK Stack / Loki | 集中式日志管理 |
| 追踪 | Jaeger | 分布式追踪 |
| API文档 | Swagger/OpenAPI | 自动生成API文档 |

### 开发工具

| 工具 | 说明 |
|------|------|
| golangci-lint | 代码静态检查 |
| gofmt/goimports | 代码格式化 |
| go test | 单元测试 |
| air | 热重载开发 |
| wire | 依赖注入 |
| mockery | 自动生成Mock |
| swaggo | Swagger文档生成 |

---

## 总结

本迁移分析文档详细涵盖了AI-Codereview-Gitlab项目从Python迁移到Golang的完整方案，包括：

1. **核心架构设计** - 从单体架构到微服务架构的演进
2. **数据库模型** - 完整的MySQL表结构设计和索引优化
3. **REST API** - 规范的API设计和接口定义
4. **业务逻辑** - 服务层架构和关键业务规则
5. **Webhook处理** - 异步处理引擎和错误重试机制
6. **AI评审引擎** - LLM集成和多语言支持
7. **通知系统** - 多渠道消息分发架构
8. **认证授权** - JWT + RBAC完整实现
9. **UI设计** - React前端架构和组件设计
10. **配置管理** - 多层次配置系统
11. **迁移策略** - 7个阶段的分步实施计划
12. **技术选型** - 完整的工具链推荐

通过这份文档，开发者可以：
- 理解完整的系统架构
- 快速上手Go项目开发
- 避免常见的设计陷阱
- 确保代码质量和可维护性
- 实现平滑的技术栈迁移

**下一步行动建议：**
1. 根据此文档创建Go项目骨架
2. 按照阶段逐步实施迁移
3. 每个阶段完成后进行代码审查
4. 编写完整的单元测试和集成测试
5. 建立CI/CD流水线
6. 逐步切换生产环境

---

*文档生成时间: 2025-01-01*
*文档版本: v1.0*

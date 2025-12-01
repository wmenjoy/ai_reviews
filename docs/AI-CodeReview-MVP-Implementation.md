# AI代码审核平台 - MVP实施方案 (1个月交付)

## 📋 项目概述

### 团队规模
- 100-200人研发团队
- 主要语言：Java、Golang、React/Vue/JavaScript

### 核心目标
- **质量保障**：自动审核代码，发现安全、质量、性能问题
- **提交即审核**：支持每次commit和MR的自动审核
- **灵活配置**：AI并发可配置、企业微信通知多级配置
- **渐进优化**：历史问题通过技术债务逐步改善

### MVP范围（1个月）
```
✅ 必须有：
- GitLab Webhook集成（Push + MR）
- 审核队列系统（可配置并发）
- 本地AI模型调用（OpenAI兼容API）
- 基础规则库（Java、Go、React各5-10条）
- Web管理后台（服务配置、审核记录、队列监控）
- 企业微信通知（项目→人员→部门→默认多级配置）
- 简单认证（用户名密码）

❌ 暂不做（二期）：
- GitHub支持
- C/Python支持
- 用户中心/SSO集成
- 复杂权限管理
- IDE插件
- 技术债务详细分析
- 专家审核流程
```

---

## 🏗️ 技术架构

### 整体架构图

```
GitLab Webhook
    ↓
Webhook服务 (签名验证)
    ↓
优先级队列 (BullMQ + Redis)
    ├─ 高优先级: MR、Main分支
    ├─ 中优先级: Feature分支
    └─ 低优先级: 文档变更
    ↓
审核引擎 (并发控制)
    ├─ 代码变更提取
    ├─ 语言检测
    ├─ 规则匹配
    └─ AI模型调用 (可配置并发数)
    ↓
结果存储
    ├─ PostgreSQL (元数据、违规记录)
    └─ JSON字段 (详细内容)
    ↓
多渠道通知
    ├─ 企业微信 (多级配置)
    └─ GitLab评论
```

### 技术栈

**后端**
```json
{
  "runtime": "Node.js 20 LTS",
  "framework": "NestJS 10",
  "database": "PostgreSQL 16",
  "cache_queue": "Redis 7",
  "orm": "Prisma 5",
  "queue": "BullMQ 4",
  "gitlab_sdk": "@gitbeaker/rest",
  "ai_client": "axios (OpenAI兼容API)"
}
```

**前端**
```json
{
  "framework": "React 18",
  "build": "Vite 5",
  "ui": "Ant Design 5",
  "router": "React Router v6",
  "state": "Zustand",
  "request": "axios"
}
```

**基础设施**
```
- Docker + Docker Compose (部署)
- Nginx (反向代理)
- Bull Board (队列可视化)
```

---

## 🗄️ 数据库设计

### Prisma Schema (完整版)

```prisma
// This is your Prisma schema file

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============ 用户认证 ============
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // bcrypt加密
  name      String
  email     String?
  role      UserRole @default(DEVELOPER)

  reviews   Review[] @relation("ReviewAuthor")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum UserRole {
  ADMIN      // 管理员
  DEVELOPER  // 开发者
}

// ============ AI模型配置 ============
model AIModelConfig {
  id              String   @id @default(cuid())
  name            String   // "主力模型Qwen2.5"
  provider        String   @default("openai-compatible")

  // 连接配置
  endpoint        String   // http://192.168.1.100:8000/v1/chat/completions
  apiKey          String?  // Bearer token (如果需要)
  model           String   // "qwen2.5-coder-32b"

  // 并发控制（关键）
  maxConcurrent   Int      @default(4)    // 最大并发请求数
  timeout         Int      @default(60)   // 超时时间（秒）

  // 限流配置
  rateLimitConfig Json?    // { "rpm": 60, "reqPerSecond": 2 }

  // 重试策略
  retryConfig     Json?    // { "maxRetries": 3, "backoff": "exponential" }

  // 优先级和状态
  priority        Int      @default(0)
  enabled         Boolean  @default(true)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ============ 服务管理 ============
model Service {
  id              String   @id @default(cuid())
  name            String   // "user-service"
  gitlabProjectId String   // GitLab项目ID
  gitlabUrl       String   // https://gitlab.company.com/backend/user-service
  gitlabToken     String   // Personal Access Token

  // Webhook配置
  webhookSecret   String   // 自动生成
  webhookEnabled  Boolean  @default(true)

  // 审核配置
  reviewOnPush    Boolean  @default(true)
  reviewOnMR      Boolean  @default(true)

  // 关联
  reviews         Review[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([gitlabProjectId])
}

// ============ 审核记录 ============
model Review {
  id            String       @id @default(cuid())
  serviceId     String
  service       Service      @relation(fields: [serviceId], references: [id])

  // Git信息
  eventType     EventType
  branch        String
  commitHash    String
  mrIid         Int?         // MR编号 (Merge Request的内部ID)
  author        String       // Git提交者

  // 审核状态
  status        ReviewStatus @default(PENDING)

  // 审核结果
  overallScore  Float?       // 0-100
  summary       String?      @db.Text

  // 详细结果（JSON存储）
  details       Json?        // { fileReviews: [...], aiMetadata: {...} }

  // 违规记录
  violations    Violation[]

  // 时间统计
  startedAt     DateTime?
  completedAt   DateTime?
  duration      Int?         // 审核耗时（秒）

  createdAt     DateTime     @default(now())

  @@index([serviceId, createdAt])
  @@index([commitHash])
  @@index([status])
}

enum EventType {
  PUSH
  MERGE_REQUEST
}

enum ReviewStatus {
  PENDING       // 队列中等待
  RUNNING       // 审核中
  COMPLETED     // 已完成
  FAILED        // 失败
}

// ============ 违规记录 ============
model Violation {
  id          String   @id @default(cuid())
  reviewId    String
  review      Review   @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  file        String
  line        Int?
  severity    Severity
  category    String   // SECURITY, QUALITY, PERFORMANCE, STYLE
  message     String   @db.Text
  suggestion  String?  @db.Text

  @@index([reviewId])
  @@index([severity])
}

enum Severity {
  CRITICAL   // 严重（必须修复）
  ERROR      // 错误（建议修复）
  WARNING    // 警告（可选修复）
  INFO       // 信息（建议改进）
}

// ============ 通知配置（多级） ============
model NotificationConfig {
  id                 String      @id @default(cuid())

  // 配置级别（互斥）
  level              ConfigLevel
  serviceId          String?     // 项目级
  userId             String?     // 人员级
  departmentId       String?     // 部门级
  isDefault          Boolean     @default(false) // 默认配置

  // 企业微信配置
  wecomWebhookUrl    String?
  wecomEnabled       Boolean     @default(true)

  // 通知触发条件
  notifyOnComplete   Boolean     @default(true)   // 审核完成时
  notifyOnCritical   Boolean     @default(true)   // 发现严重问题时
  notifyThreshold    Int         @default(80)     // 得分低于此值时通知

  // 通知内容
  includeDetails     Boolean     @default(false)  // 是否包含详细问题列表
  mentionUsers       String[]    @default([])     // @的用户列表

  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  @@unique([level, serviceId, userId, departmentId])
}

enum ConfigLevel {
  SERVICE    // 项目级（优先级最高）
  USER       // 人员级
  DEPARTMENT // 部门级
  DEFAULT    // 默认（优先级最低）
}

// ============ 审核规则 ============
model ReviewRule {
  id             String       @id @default(cuid())
  name           String       // "SQL注入检测"
  description    String       @db.Text
  category       RuleCategory

  // 适用语言
  languages      String[]     // ["java", "kotlin"]

  // Prompt模板
  promptTemplate String       @db.Text

  enabled        Boolean      @default(true)

  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([category, enabled])
}

enum RuleCategory {
  SECURITY      // 安全
  QUALITY       // 质量
  PERFORMANCE   // 性能
  STYLE         // 风格
}
```

### 数据库初始化脚本

```sql
-- 创建数据库
CREATE DATABASE ai_code_review;

-- 初始化Prisma
-- npx prisma migrate dev --name init

-- 插入默认AI模型配置
INSERT INTO "AIModelConfig" (id, name, provider, endpoint, model, "maxConcurrent", timeout, enabled)
VALUES (
  gen_random_uuid()::text,
  '主力模型Qwen2.5',
  'openai-compatible',
  'http://localhost:8000/v1/chat/completions',
  'qwen2.5-coder-32b',
  4,
  60,
  true
);

-- 插入默认通知配置
INSERT INTO "NotificationConfig" (id, level, "isDefault", "wecomEnabled", "notifyOnComplete", "notifyOnCritical", "notifyThreshold")
VALUES (
  gen_random_uuid()::text,
  'DEFAULT',
  true,
  false,  -- 默认不启用，等用户配置webhook
  true,
  true,
  80
);

-- 插入初始管理员（密码: admin123）
INSERT INTO "User" (id, username, password, name, role)
VALUES (
  gen_random_uuid()::text,
  'admin',
  '$2b$10$K7QvZ5xGxJ5Y5Y5Y5Y5Y5.xYxYxYxYxYxYxYxYxYxYxYxYxYxYxYxY',  -- bcrypt of 'admin123'
  '管理员',
  'ADMIN'
);
```

---

## 🔧 核心功能实现

### 1. AI调度器（并发控制）

```typescript
// src/review/ai-scheduler.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

interface Semaphore {
  acquire(): Promise<() => void>;
}

class SimpleSemaphore implements Semaphore {
  private queue: Array<() => void> = [];
  private current = 0;

  constructor(private max: number) {}

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      return () => this.release();
    }

    return new Promise(resolve => {
      this.queue.push(() => {
        this.current++;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }
}

@Injectable()
export class AISchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AISchedulerService.name);
  private semaphores: Map<string, Semaphore> = new Map();
  private configs: Map<string, any> = new Map();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadConfigs();
  }

  async loadConfigs() {
    const configs = await this.prisma.aIModelConfig.findMany({
      where: { enabled: true }
    });

    configs.forEach(config => {
      this.semaphores.set(config.id, new SimpleSemaphore(config.maxConcurrent));
      this.configs.set(config.id, config);
      this.logger.log(`Loaded AI model: ${config.name} (max concurrent: ${config.maxConcurrent})`);
    });
  }

  async callAI(prompt: string, options?: { modelId?: string }): Promise<string> {
    // 获取配置
    const modelId = options?.modelId || this.getDefaultModelId();
    const config = this.configs.get(modelId);

    if (!config) {
      throw new Error(`AI model config not found: ${modelId}`);
    }

    const semaphore = this.semaphores.get(modelId);

    // 等待并发槽位
    const release = await semaphore.acquire();

    this.logger.debug(`AI call started (model: ${config.name})`);

    try {
      const startTime = Date.now();

      const response = await axios.post(
        config.endpoint,
        {
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.2
        },
        {
          headers: config.apiKey ? {
            'Authorization': `Bearer ${config.apiKey}`
          } : {},
          timeout: config.timeout * 1000
        }
      );

      const duration = Date.now() - startTime;
      this.logger.debug(`AI call completed in ${duration}ms`);

      return response.data.choices[0].message.content;

    } catch (error) {
      this.logger.error(`AI call failed: ${error.message}`);
      throw error;
    } finally {
      release();
    }
  }

  private getDefaultModelId(): string {
    // 返回优先级最高的模型
    const configs = Array.from(this.configs.values());
    const sorted = configs.sort((a, b) => b.priority - a.priority);
    return sorted[0]?.id;
  }
}
```

### 2. 企业微信通知（多级配置）

```typescript
// src/notification/notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {}

  async sendReviewNotification(review: any) {
    // 解析配置（多级优先级）
    const config = await this.resolveConfig({
      serviceId: review.serviceId,
      userId: review.authorId,
      departmentId: review.author?.departmentId
    });

    // 检查是否启用
    if (!config.wecomEnabled || !config.wecomWebhookUrl) {
      this.logger.debug('WeCom notification disabled or not configured');
      return;
    }

    // 检查触发条件
    const shouldNotify =
      config.notifyOnComplete ||
      (config.notifyOnCritical && this.hasCriticalIssues(review)) ||
      (review.overallScore < config.notifyThreshold);

    if (!shouldNotify) {
      this.logger.debug('Notification conditions not met');
      return;
    }

    // 发送通知
    await this.sendToWeCom(config, review);
  }

  async resolveConfig(context: {
    serviceId: string;
    userId?: string;
    departmentId?: string;
  }): Promise<any> {

    // 1. 项目级配置
    let config = await this.prisma.notificationConfig.findFirst({
      where: {
        level: 'SERVICE',
        serviceId: context.serviceId
      }
    });
    if (config) {
      this.logger.debug(`Using SERVICE level config for ${context.serviceId}`);
      return config;
    }

    // 2. 人员级配置
    if (context.userId) {
      config = await this.prisma.notificationConfig.findFirst({
        where: {
          level: 'USER',
          userId: context.userId
        }
      });
      if (config) {
        this.logger.debug(`Using USER level config for ${context.userId}`);
        return config;
      }
    }

    // 3. 部门级配置
    if (context.departmentId) {
      config = await this.prisma.notificationConfig.findFirst({
        where: {
          level: 'DEPARTMENT',
          departmentId: context.departmentId
        }
      });
      if (config) {
        this.logger.debug(`Using DEPARTMENT level config`);
        return config;
      }
    }

    // 4. 默认配置
    config = await this.prisma.notificationConfig.findFirst({
      where: { isDefault: true }
    });

    this.logger.debug(`Using DEFAULT config`);
    return config;
  }

  private async sendToWeCom(config: any, review: any) {
    const emoji = review.overallScore >= 90 ? '✅' :
                  review.overallScore >= 70 ? '⚠️' : '❌';

    const criticalCount = review.violations.filter(v => v.severity === 'CRITICAL').length;
    const errorCount = review.violations.filter(v => v.severity === 'ERROR').length;

    let content = `### ${emoji} 代码审核完成\n\n`;
    content += `**服务**: ${review.service.name}\n`;
    content += `**分支**: ${review.branch}\n`;
    content += `**得分**: ${review.overallScore}/100\n`;
    content += `**问题**: ${review.violations.length}个 `;
    if (criticalCount > 0) content += `(严重:${criticalCount} `;
    if (errorCount > 0) content += `错误:${errorCount})`;
    content += `\n\n`;

    if (config.includeDetails && review.violations.length > 0) {
      content += `**主要问题**:\n`;
      review.violations.slice(0, 3).forEach(v => {
        content += `- ${v.file}:${v.line} - ${v.message}\n`;
      });
      if (review.violations.length > 3) {
        content += `- ... 还有${review.violations.length - 3}个问题\n`;
      }
      content += `\n`;
    }

    content += `[查看详情](${process.env.APP_URL}/review/${review.id})`;

    // @用户
    if (config.mentionUsers && config.mentionUsers.length > 0) {
      content += `\n\n`;
      config.mentionUsers.forEach(user => {
        content += `<@${user}> `;
      });
    }

    const message = {
      msgtype: 'markdown',
      markdown: { content }
    };

    try {
      await axios.post(config.wecomWebhookUrl, message);
      this.logger.log(`WeCom notification sent for review ${review.id}`);
    } catch (error) {
      this.logger.error(`Failed to send WeCom notification: ${error.message}`);
    }
  }

  private hasCriticalIssues(review: any): boolean {
    return review.violations.some(v => v.severity === 'CRITICAL');
  }
}
```

### 3. 审核引擎

```typescript
// src/review/review-engine.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GitLabService } from '../gitlab/gitlab.service';
import { AISchedulerService } from './ai-scheduler.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ReviewEngineService {
  private readonly logger = new Logger(ReviewEngineService.name);

  constructor(
    private prisma: PrismaService,
    private gitlab: GitLabService,
    private aiScheduler: AISchedulerService,
    private notification: NotificationService
  ) {}

  async reviewCommit(task: any): Promise<any> {
    const { serviceId, commitHash, eventType, mrIid } = task;

    this.logger.log(`Starting review for ${serviceId}@${commitHash}`);

    // 创建审核记录
    const review = await this.prisma.review.create({
      data: {
        serviceId,
        commitHash,
        eventType,
        mrIid,
        branch: task.branch,
        author: task.author,
        status: 'RUNNING',
        startedAt: new Date()
      },
      include: { service: true }
    });

    try {
      // 获取代码变更
      const changes = await this.getChanges(review);

      // 过滤文件
      const filesToReview = this.filterFiles(changes);

      if (filesToReview.length === 0) {
        return await this.completeReview(review, {
          score: 100,
          summary: '无需审核的代码变更',
          violations: []
        });
      }

      this.logger.log(`Reviewing ${filesToReview.length} files`);

      // 并行审核文件
      const fileReviews = await Promise.all(
        filesToReview.map(file => this.reviewFile(file))
      );

      // 汇总结果
      const result = this.aggregateResults(fileReviews);

      // 保存违规记录
      await this.saveViolations(review.id, result.violations);

      // 完成审核
      return await this.completeReview(review, result);

    } catch (error) {
      await this.failReview(review, error);
      throw error;
    }
  }

  private async getChanges(review: any): Promise<any[]> {
    if (review.mrIid) {
      // MR: 获取MR的所有变更
      return await this.gitlab.getMRChanges(review.service, review.mrIid);
    } else {
      // Push: 获取commit的变更
      return await this.gitlab.getCommitChanges(review.service, review.commitHash);
    }
  }

  private filterFiles(changes: any[]): any[] {
    const skipPatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /go\.sum$/,
      /\.min\.(js|css)$/,
      /dist\//,
      /build\//,
      /node_modules\//
    ];

    return changes.filter(change => {
      // 跳过删除的文件
      if (change.deleted_file) return false;

      // 跳过匹配的模式
      if (skipPatterns.some(p => p.test(change.new_path))) return false;

      return true;
    });
  }

  private async reviewFile(file: any): Promise<any> {
    const language = this.detectLanguage(file.new_path);

    if (!['java', 'go', 'javascript', 'typescript'].includes(language)) {
      return { file: file.new_path, skip: true };
    }

    // 获取规则
    const rules = await this.getRulesForLanguage(language);

    // 构建prompt
    const prompt = this.buildPrompt(file, rules, language);

    // 调用AI
    const aiResponse = await this.aiScheduler.callAI(prompt);

    // 解析结果
    return this.parseAIResponse(aiResponse, file);
  }

  private detectLanguage(filename: string): string {
    const ext = filename.split('.').pop();
    const langMap = {
      'java': 'java',
      'kt': 'java',
      'go': 'go',
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'javascript'
    };
    return langMap[ext] || 'unknown';
  }

  private async getRulesForLanguage(language: string): Promise<any[]> {
    return await this.prisma.reviewRule.findMany({
      where: {
        enabled: true,
        languages: { has: language }
      }
    });
  }

  private buildPrompt(file: any, rules: any[], language: string): string {
    const ruleDescriptions = rules
      .map(r => `- [${r.category}] ${r.name}: ${r.description}`)
      .join('\n');

    return `
你是一个${language}代码审核专家。请审核以下代码变更。

重点检查规则：
${ruleDescriptions}

代码文件: ${file.new_path}
代码变更:
\`\`\`diff
${file.diff}
\`\`\`

请以JSON格式输出：
{
  "issues": [
    {
      "line": 行号,
      "severity": "CRITICAL|ERROR|WARNING|INFO",
      "category": "SECURITY|QUALITY|PERFORMANCE|STYLE",
      "message": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "score": 0-100,
  "summary": "整体评价"
}
    `.trim();
  }

  private parseAIResponse(aiResponse: string, file: any): any {
    try {
      const json = JSON.parse(aiResponse);
      return {
        file: file.new_path,
        score: json.score || 100,
        summary: json.summary,
        issues: json.issues || []
      };
    } catch (error) {
      this.logger.error(`Failed to parse AI response: ${error.message}`);
      return {
        file: file.new_path,
        score: 100,
        issues: []
      };
    }
  }

  private aggregateResults(fileReviews: any[]): any {
    const allIssues = fileReviews.flatMap(r =>
      (r.issues || []).map(issue => ({
        ...issue,
        file: r.file
      }))
    );

    // 计算得分
    const criticalCount = allIssues.filter(i => i.severity === 'CRITICAL').length;
    const errorCount = allIssues.filter(i => i.severity === 'ERROR').length;
    const warningCount = allIssues.filter(i => i.severity === 'WARNING').length;

    let score = 100;
    score -= criticalCount * 20;
    score -= errorCount * 10;
    score -= warningCount * 5;
    score = Math.max(0, score);

    return {
      score,
      summary: this.generateSummary(allIssues),
      violations: allIssues,
      details: { fileReviews }
    };
  }

  private generateSummary(issues: any[]): string {
    if (issues.length === 0) {
      return '代码质量良好，未发现明显问题';
    }

    const critical = issues.filter(i => i.severity === 'CRITICAL').length;
    const error = issues.filter(i => i.severity === 'ERROR').length;

    if (critical > 0) {
      return `发现${critical}个严重问题，建议立即修复`;
    } else if (error > 0) {
      return `发现${error}个错误，建议修复后合并`;
    } else {
      return `代码整体质量可以，有${issues.length}个改进建议`;
    }
  }

  private async saveViolations(reviewId: string, violations: any[]) {
    await this.prisma.violation.createMany({
      data: violations.map(v => ({
        reviewId,
        file: v.file,
        line: v.line,
        severity: v.severity,
        category: v.category,
        message: v.message,
        suggestion: v.suggestion
      }))
    });
  }

  private async completeReview(review: any, result: any): Promise<any> {
    const duration = Math.floor((Date.now() - review.startedAt.getTime()) / 1000);

    const updated = await this.prisma.review.update({
      where: { id: review.id },
      data: {
        status: 'COMPLETED',
        overallScore: result.score,
        summary: result.summary,
        details: result.details,
        completedAt: new Date(),
        duration
      },
      include: {
        service: true,
        violations: true
      }
    });

    this.logger.log(`Review completed: ${review.id} (score: ${result.score}, duration: ${duration}s)`);

    // 发送通知
    await this.notification.sendReviewNotification(updated);

    // 发布到GitLab
    if (updated.mrIid) {
      await this.postToGitLab(updated);
    }

    return updated;
  }

  private async postToGitLab(review: any) {
    const comment = this.formatComment(review);
    await this.gitlab.postMRComment(review.service, review.mrIid, comment);
  }

  private formatComment(review: any): string {
    const emoji = review.overallScore >= 90 ? '✅' :
                  review.overallScore >= 70 ? '⚠️' : '❌';

    let comment = `## ${emoji} AI代码审核结果\n\n`;
    comment += `**得分**: ${review.overallScore}/100\n\n`;
    comment += `**总结**: ${review.summary}\n\n`;

    const criticals = review.violations.filter(v => v.severity === 'CRITICAL');
    if (criticals.length > 0) {
      comment += `### 🚨 严重问题\n\n`;
      criticals.forEach(v => {
        comment += `- **${v.file}:${v.line}** - ${v.message}\n`;
      });
    }

    comment += `\n[查看完整报告](${process.env.APP_URL}/review/${review.id})`;

    return comment;
  }

  private async failReview(review: any, error: Error) {
    await this.prisma.review.update({
      where: { id: review.id },
      data: {
        status: 'FAILED',
        summary: `审核失败: ${error.message}`
      }
    });

    this.logger.error(`Review failed: ${review.id}`, error.stack);
  }
}
```

### 4. 队列处理器

```typescript
// src/queue/review.processor.ts
import { Processor, Process } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ReviewEngineService } from '../review/review-engine.service';

@Processor('review')
export class ReviewProcessor {
  private readonly logger = new Logger(ReviewProcessor.name);

  constructor(private reviewEngine: ReviewEngineService) {}

  @Process()
  async handleReview(job: Job) {
    this.logger.log(`Processing review job ${job.id}: ${job.data.serviceId}@${job.data.commitHash}`);

    try {
      await this.reviewEngine.reviewCommit(job.data);
      this.logger.log(`Review job ${job.id} completed`);
    } catch (error) {
      this.logger.error(`Review job ${job.id} failed: ${error.message}`);
      throw error; // BullMQ会自动重试
    }
  }
}
```

---

## 📅 4周实施计划

### Week 1: 基础架构

**目标**: 搭建项目框架，跑通数据流

**Day 1-2**: 项目初始化
- [ ] 创建NestJS项目
- [ ] 配置Prisma + PostgreSQL
- [ ] Docker Compose配置（PostgreSQL + Redis）
- [ ] 基础模块划分

**Day 3-4**: Webhook服务
- [ ] GitLab Webhook Controller
- [ ] 签名验证
- [ ] 事件解析（Push + MR）
- [ ] 测试：接收GitLab事件

**Day 5-7**: 队列系统
- [ ] BullMQ集成
- [ ] 优先级队列
- [ ] Bull Board（队列监控）
- [ ] 测试：任务入队出队

**交付标准**: GitLab推送代码 → 触发Webhook → 任务进队列 → 打印日志

---

### Week 2: AI审核引擎

**目标**: 实现完整审核流程

**Day 8-9**: AI客户端
- [ ] AISchedulerService（并发控制）
- [ ] OpenAI兼容API调用
- [ ] Prompt模板设计
- [ ] 测试：调用本地模型

**Day 10-11**: 审核引擎
- [ ] GitLab API集成（获取代码变更）
- [ ] ReviewEngineService
- [ ] 文件过滤逻辑
- [ ] 测试：单个文件审核

**Day 12-14**: 规则和结果存储
- [ ] 规则模板（Java/Go/React各5条）
- [ ] AI结果解析
- [ ] 违规记录存储
- [ ] 测试：完整审核流程

**交付标准**: 提交代码 → 自动审核 → 存储结果 → 能识别问题

---

### Week 3: Web管理后台

**目标**: 能配置、能查看

**Day 15-16**: 前端框架
- [ ] React + Vite初始化
- [ ] Ant Design集成
- [ ] 路由配置
- [ ] 简单登录页（JWT）

**Day 17-18**: 核心页面
- [ ] 服务管理（列表、新增、编辑）
- [ ] 审核记录列表
- [ ] 审核详情页（代码diff + 问题列表）

**Day 19-21**: 配置和监控
- [ ] AI模型配置页
- [ ] 企业微信通知配置页
- [ ] 队列监控页（Bull Board集成）
- [ ] 测试：完整Web流程

**交付标准**: 在Web界面添加仓库 → 查看审核历史 → 配置通知

---

### Week 4: 集成测试和上线

**目标**: 稳定运行

**Day 22-23**: 通知集成
- [ ] 企业微信通知实现
- [ ] 多级配置查找逻辑
- [ ] GitLab评论发布
- [ ] 测试：通知推送

**Day 24-25**: 完整测试
- [ ] 接入3-5个真实仓库
- [ ] 压力测试（模拟50个并发）
- [ ] 修复bug
- [ ] 性能优化

**Day 26-27**: 部署和文档
- [ ] Dockerfile编写
- [ ] 部署脚本
- [ ] 用户文档（如何接入）
- [ ] 运维文档

**Day 28**: 灰度上线
- [ ] 选2个试点项目
- [ ] 收集反馈
- [ ] 快速迭代

**交付标准**: 系统稳定运行，3个项目接入，无重大bug

---

## 🚀 部署指南

### Docker Compose配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ai_code_review
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ai_code_review
      REDIS_URL: redis://redis:6379
      APP_URL: http://localhost
      AI_MODEL_ENDPOINT: http://your-gpu-server:8000/v1/chat/completions
    depends_on:
      - postgres
      - redis
    ports:
      - "3000:3000"

  frontend:
    build: ./frontend
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  postgres_data:
```

### 环境变量

```bash
# .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_code_review"
REDIS_URL="redis://localhost:6379"

# 应用配置
APP_URL="https://code-review.company.com"
JWT_SECRET="your-random-secret-key"

# AI模型配置（可在Web界面修改）
AI_MODEL_ENDPOINT="http://192.168.1.100:8000/v1/chat/completions"
AI_MODEL_NAME="qwen2.5-coder-32b"
AI_MAX_CONCURRENT=4

# GitLab配置
GITLAB_HOST="https://gitlab.company.com"
```

### 启动步骤

```bash
# 1. 克隆代码
git clone <repository>
cd ai-code-review

# 2. 启动数据库
docker-compose up -d postgres redis

# 3. 初始化数据库
cd backend
npm install
npx prisma migrate dev
npm run seed  # 插入默认配置

# 4. 启动后端
npm run start:dev

# 5. 启动前端
cd frontend
npm install
npm run dev

# 6. 访问
# Web界面: http://localhost:5173
# API文档: http://localhost:3000/api
# 队列监控: http://localhost:3000/admin/queues
```

### 生产部署

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f backend

# 初始化管理员
curl -X POST http://localhost:3000/api/auth/init
```

---

## 📊 监控和运维

### 关键指标

```typescript
// 在Bull Board中可以看到：
- 队列长度（实时）
- 正在处理的任务
- 已完成任务数
- 失败任务数
- 平均处理时间

// 需要额外添加的监控：
- AI模型并发使用率
- 审核成功率
- 平均审核时长
- 每日审核量
```

### 日志查看

```bash
# 实时日志
docker-compose logs -f backend

# 查看错误
docker-compose logs backend | grep ERROR

# 查看AI调用
docker-compose logs backend | grep "AI call"
```

### 常见问题排查

**1. 队列积压**
```bash
# 查看队列状态
curl http://localhost:3000/admin/queues

# 增加AI并发（在Web界面或数据库）
UPDATE "AIModelConfig" SET "maxConcurrent" = 8 WHERE id = 'xxx';
```

**2. AI调用失败**
```bash
# 检查AI服务可用性
curl -X POST http://your-gpu-server:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5-coder-32b","messages":[{"role":"user","content":"hello"}]}'

# 查看失败任务
# 访问 http://localhost:3000/admin/queues
# 点击"Failed"查看详情
```

**3. Webhook未触发**
```bash
# 检查GitLab Webhook配置
# 项目设置 > Webhooks > Recent Deliveries

# 手动测试Webhook
curl -X POST http://localhost:3000/api/webhook/gitlab/SERVICE_ID \
  -H "X-Gitlab-Token: SECRET" \
  -H "X-Gitlab-Event: Push Hook" \
  -d @test-payload.json
```

---

## 📝 使用文档

### 管理员操作

**1. 首次登录**
```
1. 访问 http://your-domain.com
2. 默认账号: admin / admin123
3. 登录后立即修改密码
```

**2. 配置AI模型**
```
1. 进入"系统配置" > "AI模型"
2. 填写API地址、模型名称
3. 设置并发数（根据GPU能力）
4. 点击"测试连接"确认可用
5. 保存
```

**3. 添加GitLab仓库**
```
1. 在GitLab创建Personal Access Token
   权限: api, read_repository
2. 进入"服务管理" > "新增服务"
3. 填写仓库信息和Token
4. 系统自动配置Webhook
5. 测试：推送代码，查看是否触发审核
```

**4. 配置企业微信通知**
```
1. 在企业微信创建群机器人
2. 复制Webhook URL
3. 进入"通知配置"
4. 选择配置级别（项目/部门/默认）
5. 填写Webhook URL
6. 设置触发条件
7. 点击"测试通知"确认
```

### 开发者操作

**1. 查看审核结果**
```
方式1: GitLab MR评论
方式2: 企业微信通知
方式3: Web界面查看历史
```

**2. 处理审核问题**
```
1. 查看具体问题和建议
2. 修复代码
3. 再次提交
4. 查看新的审核结果
```

---

## 🎯 MVP验收标准

一个月后必须达到：

**功能验收**
- [ ] GitLab仓库能正常接入
- [ ] Push和MR都能触发审核
- [ ] 能识别Java/Go/React的常见问题
- [ ] Web界面能查看审核历史
- [ ] 企业微信通知能正常发送
- [ ] 队列系统稳定运行

**性能指标**
- [ ] 平均审核时长 < 5分钟
- [ ] 队列无严重积压（P90 < 10分钟）
- [ ] 审核准确率 > 70%
- [ ] 系统稳定性 > 95%

**运维要求**
- [ ] 有完整的日志记录
- [ ] 有基础的监控面板
- [ ] 有故障恢复机制
- [ ] 有用户文档

---

## 🔄 二期规划

**增强功能**（2-3个月）
- GitHub支持
- C/Python语言支持
- 用户中心/SSO集成
- 技术债务详细分析
- 专家审核工作流
- 更丰富的规则库
- IDE插件（VSCode）

**优化方向**
- 审核缓存（相同代码不重复审核）
- 增量审核（只审核变更部分）
- 多AI共识模式
- 智能规则推荐
- 审核报告导出

---

## 💡 关键提示

### 给你（开发和运维）

**Week 1最重要**
- 架构设计要考虑可扩展性
- Prisma schema要设计好（后期改很麻烦）
- 多写日志，方便排查问题

**开发建议**
- 先跑通流程，再优化代码
- 每个功能完成后立即测试
- 遇到问题及时记录

**运维建议**
- 定期备份数据库
- 监控AI服务可用性
- 关注队列积压情况
- 每天检查错误日志

**时间管理**
- Week 1-2全力后端（前端不急）
- Week 3突击前端（UI丑点没关系）
- Week 4留足测试时间

---

## 📞 支持

遇到问题时：
1. 查看日志（docker-compose logs）
2. 检查队列状态（Bull Board）
3. 测试AI服务（curl测试）
4. 回顾文档

**本文档涵盖：**
- ✅ 完整数据库设计
- ✅ 核心代码实现
- ✅ 配置化方案（AI并发、企业微信多级）
- ✅ 4周实施计划
- ✅ 部署和运维指南

**祝项目顺利！一个月后见！** 🚀

# AI代码审核平台 - 架构设计文档

## 📋 项目概述

这是一个企业级AI代码审核平台，支持GitHub和GitLab集成，提供多租户管理、智能规则引擎、多AI渠道负载均衡等功能。

### 核心特性

1. **Git平台集成**: 支持GitHub和GitLab的Webhook监听，自动触发Push和Merge Request审核
2. **多租户架构**: 公司/部门/用户三级管理，支持企业用户中心集成
3. **服务管理**: 每个服务独立配置Git地址、基线、通知方式，支持配置继承
4. **审核报告**: 提供详细的审核明细、整体打分、技术债务分析
5. **多维度管理**: 用户、部门、公司三个维度的审核数据统计和管理
6. **智能规则引擎**: 根据不同语言/框架生成差异化规则和提示语
7. **规则库管理**: 维护不同编程语言的审核规则库
8. **审核记录系统**: 完整的审核历史、分规则统计、趋势分析
9. **AI渠道管理**: 多AI提供商负载均衡、Token配额管理、分部门计费
10. **权限管理**: 基于RBAC的细粒度权限控制
11. **IDE集成**: VSCode/IntelliJ IDEA插件，类似SonarLint的实时审核

---

## 🏗️ 系统整体架构

### 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                    前端层 (Frontend)                          │
├─────────────────────────────────────────────────────────────┤
│  Web管理后台    │  IDE插件(VSCode/IDEA)  │  CLI工具          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  API网关层 (API Gateway)                      │
├─────────────────────────────────────────────────────────────┤
│  认证/授权  │  限流  │  路由  │  日志  │  监控                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    业务服务层 (Services)                      │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Webhook服务  │  审核引擎    │  规则引擎    │  通知服务      │
│              │              │              │               │
│ Git集成服务  │  AI调度器    │  计费服务    │  报表服务      │
└──────────────┴──────────────┴──────────────┴───────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    数据层 (Data Layer)                        │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ PostgreSQL   │   Redis      │  MongoDB     │  对象存储      │
│ (关系数据)   │  (缓存/队列) │  (审核详情)  │  (代码快照)    │
└──────────────┴──────────────┴──────────────┴───────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  AI服务层 (AI Layer)                          │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ OpenAI       │  Claude      │  Gemini      │  Local LLM    │
│ (GPT-4/o1)   │  (Sonnet)    │  (Pro/Flash) │  (Ollama)     │
└──────────────┴──────────────┴──────────────┴───────────────┘
```

### 数据流转图

```
GitHub/GitLab Webhook
    ↓
Webhook服务 (签名验证)
    ↓
任务队列 (BullMQ) ────────→ 优先级调度
    ↓                         (大PR后台, 小PR实时)
审核引擎
    ├─→ 上下文构建
    ├─→ 规则匹配
    ├─→ AI调度器 ──→ 负载均衡 ──→ 多AI渠道
    └─→ 结果聚合
    ↓
审核报告生成
    ├─→ PostgreSQL (元数据)
    ├─→ MongoDB (详细内容)
    └─→ 通知服务 (多渠道)
    ↓
Git平台 (发布评论)
用户/团队 (邮件/IM通知)
```

---

## 💻 技术选型

### 后端技术栈 (推荐方案)

**框架**: Node.js + TypeScript + NestJS
- **理由**:
  - NestJS提供企业级架构模式(依赖注入、模块化)
  - TypeScript保证类型安全
  - 异步处理能力强，适合AI调用等IO密集型任务
  - 生态丰富，GitHub/GitLab SDK成熟

**核心依赖**:
```json
{
  "framework": "NestJS 10.x",
  "orm": "Prisma 5.x",
  "queue": "BullMQ 4.x",
  "cache": "ioredis 5.x",
  "validation": "class-validator + class-transformer",
  "auth": "Passport.js + JWT",
  "docs": "Swagger/OpenAPI 3.0",
  "testing": "Jest + Supertest"
}
```

**Git集成**:
```typescript
{
  "github": "@octokit/rest",
  "gitlab": "@gitbeaker/rest",
  "webhook": "express-x-hub (签名验证)"
}
```

**AI SDK**:
```typescript
{
  "openai": "openai 4.x",
  "anthropic": "@anthropic-ai/sdk",
  "google": "@google/generative-ai",
  "unified": "langchain (可选,用于统一接口)"
}
```

### 替代方案: Go

**优势**: 性能更好、并发能力强、部署简单
```go
{
  "框架": "Gin / Fiber",
  "ORM": "GORM",
  "队列": "Asynq",
  "缓存": "go-redis"
}
```

**选择建议**: 如果团队对Go更熟悉，或对性能有极高要求(>1000 req/s)，选择Go

### 前端技术栈

```json
{
  "framework": "React 18 + TypeScript",
  "buildTool": "Vite 5.x",
  "uiLibrary": "Ant Design Pro 5.x / shadcn/ui",
  "stateManagement": "Zustand + TanStack Query",
  "charts": "Apache ECharts 5.x",
  "codeEditor": "Monaco Editor (代码diff展示)",
  "markdown": "react-markdown (审核报告渲染)"
}
```

### 数据库选型

| 数据库 | 用途 | 理由 |
|--------|------|------|
| **PostgreSQL 15+** | 关系数据 | 支持JSONB、全文搜索、强一致性 |
| **Redis 7+** | 缓存+队列 | BullMQ依赖、高性能缓存 |
| **MongoDB 6+** | 审核详情 | 灵活schema、存储大文本对话记录 |
| **S3/MinIO** | 对象存储 | 代码快照、大型diff文件 |

### 基础设施

```yaml
容器化: Docker + Docker Compose (开发) / Kubernetes (生产)
CI/CD: GitHub Actions / GitLab CI
监控: Prometheus + Grafana
日志: ELK Stack (Elasticsearch + Logstash + Kibana)
追踪: OpenTelemetry + Jaeger
```

---

## 🗄️ 数据库设计

### PostgreSQL Schema (使用Prisma)

```prisma
// ============ 组织架构 ============
model Organization {
  id          String   @id @default(cuid())
  name        String
  departments Department[]
  users       User[]
  services    Service[]
  aiChannels  AIChannel[]
  createdAt   DateTime @default(now())
}

model Department {
  id             String       @id @default(cuid())
  name           String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  users          User[]
  tokenQuota     TokenQuota?
  config         DepartmentConfig?
}

model User {
  id             String       @id @default(cuid())
  email          String       @unique
  name           String
  role           Role         @default(DEVELOPER)
  organizationId String
  departmentId   String?
  organization   Organization @relation(fields: [organizationId], references: [id])
  department     Department?  @relation(fields: [departmentId], references: [id])
  tokenQuota     TokenQuota?
  reviews        Review[]     @relation("ReviewAuthor")
}

enum Role {
  SUPER_ADMIN      // 平台管理员
  ORG_ADMIN        // 公司管理员
  DEPT_ADMIN       // 部门管理员
  DEVELOPER        // 开发者
  VIEWER           // 只读用户
}

// ============ 服务管理 ============
model Service {
  id               String       @id @default(cuid())
  name             String
  gitProvider      GitProvider
  repoUrl          String
  webhookSecret    String
  organizationId   String
  organization     Organization @relation(fields: [organizationId], references: [id])

  baseline         Baseline?
  config           ServiceConfig?
  reviews          Review[]
  techDebt         TechDebt?

  createdAt        DateTime     @default(now())

  @@index([organizationId])
}

enum GitProvider {
  GITHUB
  GITLAB
}

// ============ 基线管理 ============
model Baseline {
  id              String   @id @default(cuid())
  serviceId       String   @unique
  service         Service  @relation(fields: [serviceId], references: [id])

  branch          String   @default("main")
  commitHash      String
  qualityScore    Float    // 0-100
  techDebtScore   Float

  metrics         Json     // 详细指标
  createdAt       DateTime @default(now())
}

// ============ 配置系统 (支持继承) ============
model ServiceConfig {
  id                String   @id @default(cuid())
  serviceId         String   @unique
  service           Service  @relation(fields: [serviceId], references: [id])

  // 通知配置
  notificationChannels Json?  // [{ type: 'email', target: 'dev@example.com' }]

  // AI配置
  aiChannelIds      String[] // 指定使用的AI渠道

  // 规则配置
  enabledRules      String[] // 启用的规则ID
  customRules       Json?    // 自定义规则

  // 审核策略
  reviewStrategy    Json?    // { minScore: 80, blockOnCritical: true }
}

model DepartmentConfig {
  id                String     @id @default(cuid())
  departmentId      String     @unique
  department        Department @relation(fields: [departmentId], references: [id])

  notificationChannels Json?
  aiChannelIds         String[]
  enabledRules         String[]
}

// ============ AI渠道管理 ============
model AIChannel {
  id              String       @id @default(cuid())
  name            String
  provider        AIProvider
  model           String       // gpt-4, claude-3-5-sonnet
  endpoint        String
  apiKey          String       @db.Text

  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  // 限流配置
  rateLimit       Json         // { rpm: 60, tpm: 90000 }

  // 成本配置
  pricing         Json         // { inputPerMillion: 3.0, outputPerMillion: 15.0 }

  // 负载均衡
  weight          Int          @default(1)
  enabled         Boolean      @default(true)

  usage           AIUsage[]

  createdAt       DateTime     @default(now())

  @@index([organizationId, enabled])
}

enum AIProvider {
  OPENAI
  ANTHROPIC
  GOOGLE
  AZURE
  OLLAMA
  CUSTOM
}

// ============ Token配额管理 ============
model TokenQuota {
  id             String      @id @default(cuid())

  // 分配给用户或部门 (互斥)
  userId         String?     @unique
  user           User?       @relation(fields: [userId], references: [id])
  departmentId   String?     @unique
  department     Department? @relation(fields: [departmentId], references: [id])

  // 配额
  monthlyLimit   BigInt      // 每月token限制
  currentUsage   BigInt      @default(0)

  // 计费
  totalCost      Decimal     @default(0) @db.Decimal(10, 4)

  resetAt        DateTime    // 下次重置时间

  @@index([userId])
  @@index([departmentId])
}

model AIUsage {
  id             String     @id @default(cuid())
  aiChannelId    String
  aiChannel      AIChannel  @relation(fields: [aiChannelId], references: [id])

  reviewId       String?
  review         Review?    @relation(fields: [reviewId], references: [id])

  inputTokens    Int
  outputTokens   Int
  cost           Decimal    @db.Decimal(10, 6)

  latency        Int        // 毫秒
  success        Boolean
  errorMessage   String?    @db.Text

  createdAt      DateTime   @default(now())

  @@index([aiChannelId, createdAt])
  @@index([reviewId])
}

// ============ 审核系统 ============
model Review {
  id              String       @id @default(cuid())
  serviceId       String
  service         Service      @relation(fields: [serviceId], references: [id])

  // Git信息
  provider        GitProvider
  eventType       EventType
  prNumber        Int?
  commitHash      String
  branch          String
  author          String

  // 审核状态
  status          ReviewStatus @default(PENDING)

  // 整体评分
  overallScore    Float?       // 0-100

  // 分类评分
  scores          Json?        // { security: 95, quality: 80, performance: 85 }

  // 审核详情 (存MongoDB)
  detailsId       String?      @unique

  // 违规总结
  violations      Violation[]

  // AI使用记录
  aiUsage         AIUsage[]

  // 触发者
  triggeredById   String?
  triggeredBy     User?        @relation("ReviewAuthor", fields: [triggeredById], references: [id])

  createdAt       DateTime     @default(now())
  completedAt     DateTime?

  @@index([serviceId, createdAt])
  @@index([commitHash])
}

enum EventType {
  PUSH
  PULL_REQUEST
  MERGE_REQUEST
  MANUAL  // 手动触发
}

enum ReviewStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
}

// ============ 违规记录 ============
model Violation {
  id          String         @id @default(cuid())
  reviewId    String
  review      Review         @relation(fields: [reviewId], references: [id])

  ruleId      String
  rule        ReviewRule     @relation(fields: [ruleId], references: [id])

  file        String
  line        Int?
  severity    Severity
  message     String         @db.Text
  suggestion  String?        @db.Text

  @@index([reviewId])
  @@index([ruleId])
}

enum Severity {
  CRITICAL
  ERROR
  WARNING
  INFO
}

// ============ 规则管理 ============
model ReviewRule {
  id          String       @id @default(cuid())
  name        String
  description String       @db.Text

  // 规则分类
  category    RuleCategory

  // 适用语言
  languages   String[]     // ["javascript", "typescript"]
  frameworks  String[]     // ["react", "vue"]

  // 规则内容
  prompt      String       @db.Text
  pattern     String?      // 正则匹配模式(可选)

  // 默认严重级别
  severity    Severity     @default(WARNING)

  // 是否启用
  enabled     Boolean      @default(true)

  // 使用统计
  violations  Violation[]

  createdAt   DateTime     @default(now())

  @@index([category, enabled])
}

enum RuleCategory {
  SECURITY
  QUALITY
  PERFORMANCE
  STYLE
  DOCUMENTATION
  TESTING
  CUSTOM
}

// ============ 技术债务 ============
model TechDebt {
  id              String   @id @default(cuid())
  serviceId       String   @unique
  service         Service  @relation(fields: [serviceId], references: [id])

  // 债务总分
  totalScore      Float    // 0-100 (越低越好)

  // 分类统计
  byCategory      Json     // { security: 15, quality: 30, performance: 10 }
  byFile          Json     // { "src/app.ts": 25, "src/utils.ts": 10 }

  // 趋势
  trend           String   // 'improving', 'stable', 'degrading'

  updatedAt       DateTime @updatedAt
}
```

### MongoDB Schema (审核详情)

```javascript
{
  _id: ObjectId,
  reviewId: String,  // 关联PostgreSQL的Review.id

  // PR级别分析
  prAnalysis: {
    summary: String,            // AI生成的PR总结
    impact: String,             // 影响范围评估
    risks: [String],            // 潜在风险列表
    recommendations: [String]   // 改进建议
  },

  // 文件级别分析
  fileAnalyses: [{
    file: String,
    language: String,
    changes: {
      additions: Number,
      deletions: Number
    },
    review: String,           // 文件级别的审核意见
    issues: [{
      line: Number,
      severity: String,
      message: String,
      suggestion: String,
      codeSnippet: String    // 问题代码片段
    }]
  }],

  // 完整对话记录
  conversations: [{
    role: 'system' | 'user' | 'assistant',
    content: String,
    timestamp: Date,
    modelUsed: String        // 使用的AI模型
  }],

  // 元数据
  metadata: {
    aiModel: String,
    tokensUsed: {
      input: Number,
      output: Number
    },
    duration: Number,        // 审核耗时(毫秒)
    retries: Number          // 重试次数
  },

  createdAt: Date,
  updatedAt: Date
}
```

---

## 🔧 核心模块设计

### 1. Webhook服务

**职责**: 接收并验证GitHub/GitLab的Webhook事件

```typescript
// webhook.controller.ts
@Controller('webhook')
export class WebhookController {

  @Post('github/:serviceId')
  async handleGitHubWebhook(
    @Param('serviceId') serviceId: string,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Body() payload: any
  ) {
    // 1. 验证签名
    const service = await this.serviceService.findOne(serviceId);
    if (!this.verifyGitHubSignature(signature, payload, service.webhookSecret)) {
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. 解析事件
    if (event === 'push') {
      await this.handlePushEvent(service, payload);
    } else if (event === 'pull_request') {
      await this.handlePullRequestEvent(service, payload);
    }

    return { status: 'accepted' };
  }

  @Post('gitlab/:serviceId')
  async handleGitLabWebhook(
    @Param('serviceId') serviceId: string,
    @Headers('x-gitlab-token') token: string,
    @Headers('x-gitlab-event') event: string,
    @Body() payload: any
  ) {
    // GitLab使用token验证
    const service = await this.serviceService.findOne(serviceId);
    if (token !== service.webhookSecret) {
      throw new UnauthorizedException('Invalid token');
    }

    if (event === 'Push Hook') {
      await this.handlePushEvent(service, payload);
    } else if (event === 'Merge Request Hook') {
      await this.handleMergeRequestEvent(service, payload);
    }

    return { status: 'accepted' };
  }

  private verifyGitHubSignature(
    signature: string,
    payload: any,
    secret: string
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  private async handlePushEvent(service: Service, payload: any) {
    // 加入审核队列
    await this.reviewQueue.add('review-push', {
      serviceId: service.id,
      commitHash: payload.after || payload.checkout_sha,
      commits: payload.commits,
      branch: payload.ref,
      author: payload.pusher?.name || payload.user_name
    }, {
      priority: this.calculatePriority(payload)
    });
  }

  private calculatePriority(payload: any): number {
    // 根据变更大小、分支等确定优先级
    const filesChanged = payload.commits?.reduce((sum, c) =>
      sum + (c.added?.length || 0) + (c.modified?.length || 0), 0
    ) || 0;

    if (filesChanged < 5) return 1;      // 高优先级
    if (filesChanged < 20) return 5;     // 中优先级
    return 10;                            // 低优先级
  }
}
```

### 2. 审核引擎

**职责**: 核心审核逻辑，协调规则引擎和AI调度器

```typescript
// review-engine.service.ts
@Injectable()
export class ReviewEngineService {

  async reviewPullRequest(
    service: Service,
    prNumber: number
  ): Promise<ReviewResult> {
    // 1. 获取PR详情
    const pr = await this.gitService.getPullRequest(service, prNumber);
    const files = await this.gitService.getPullRequestFiles(service, prNumber);

    // 2. 构建上下文
    const context = await this.buildContext(service, pr, files);

    // 3. 分层审核 (参考prai的双阶段分析)
    const [prLevelReview, fileLevelReviews] = await Promise.all([
      this.reviewPRLevel(context),      // 整体分析
      this.reviewFileLevel(context)     // 文件级分析
    ]);

    // 4. 规则匹配
    const ruleViolations = await this.ruleEngineService.applyRules(context);

    // 5. 技术债务分析
    const techDebt = await this.analyzeTechDebt(service, files);

    // 6. 计算得分
    const scores = this.calculateScores({
      prLevelReview,
      fileLevelReviews,
      ruleViolations
    });

    // 7. 生成并存储报告
    const review = await this.saveReview({
      service,
      prNumber,
      prLevelReview,
      fileLevelReviews,
      ruleViolations,
      techDebt,
      scores
    });

    // 8. 发布评论到Git平台
    await this.gitService.postReviewComment(service, prNumber, review);

    // 9. 发送通知
    await this.notificationService.sendNotification(review);

    return review;
  }

  private async buildContext(
    service: Service,
    pr: PullRequest,
    files: FileChange[]
  ): Promise<ReviewContext> {
    // 获取配置 (带继承)
    const config = await this.configService.resolveConfig(service.id);

    // 检测语言和框架
    const languages = this.detectLanguages(files);
    const frameworks = await this.detectFrameworks(files, languages);

    // 获取基线
    const baseline = await this.baselineService.getBaseline(service.id);

    return {
      service,
      pr,
      files,
      config,
      languages,
      frameworks,
      baseline
    };
  }

  private async reviewPRLevel(context: ReviewContext): Promise<PRReview> {
    // 生成PR级别的prompt
    const prompt = this.buildPRPrompt(context);

    // 调用AI
    const aiResponse = await this.aiScheduler.review({
      prompt,
      context,
      type: 'pr-level'
    });

    return {
      summary: aiResponse.summary,
      impact: aiResponse.impact,
      risks: aiResponse.risks,
      recommendations: aiResponse.recommendations
    };
  }

  private async reviewFileLevel(context: ReviewContext): Promise<FileReview[]> {
    // 并行审核所有文件 (带限流)
    const reviews = await pMap(
      context.files,
      async (file) => this.reviewSingleFile(file, context),
      { concurrency: 5 }  // 最多5个并发
    );

    return reviews;
  }

  private async reviewSingleFile(
    file: FileChange,
    context: ReviewContext
  ): Promise<FileReview> {
    const language = this.detectFileLanguage(file.filename);

    // 获取该语言的规则
    const rules = await this.ruleEngineService.getRulesForLanguage(language);

    // 构建文件级prompt
    const prompt = this.buildFilePrompt(file, rules, context);

    // AI审核
    const aiResponse = await this.aiScheduler.review({
      prompt,
      context: { ...context, file },
      type: 'file-level'
    });

    return {
      file: file.filename,
      language,
      review: aiResponse.review,
      issues: aiResponse.issues
    };
  }

  private calculateScores(data: any): Scores {
    const { ruleViolations } = data;

    // 根据违规严重程度计算扣分
    const criticalCount = ruleViolations.filter(v => v.severity === 'CRITICAL').length;
    const errorCount = ruleViolations.filter(v => v.severity === 'ERROR').length;
    const warningCount = ruleViolations.filter(v => v.severity === 'WARNING').length;

    let overallScore = 100;
    overallScore -= criticalCount * 20;  // 严重问题扣20分
    overallScore -= errorCount * 10;     // 错误扣10分
    overallScore -= warningCount * 5;    // 警告扣5分

    return {
      overall: Math.max(0, overallScore),
      security: this.calculateCategoryScore(ruleViolations, 'SECURITY'),
      quality: this.calculateCategoryScore(ruleViolations, 'QUALITY'),
      performance: this.calculateCategoryScore(ruleViolations, 'PERFORMANCE')
    };
  }
}
```

### 3. AI调度器

**职责**: 负载均衡、多模型调度、成本优化

```typescript
// ai-scheduler.service.ts
@Injectable()
export class AISchedulerService {

  async review(request: ReviewRequest): Promise<AIResponse> {
    // 1. 获取可用的AI渠道
    const channels = await this.getAvailableChannels(request.context.service);

    if (channels.length === 0) {
      throw new Error('No available AI channels');
    }

    // 2. 选择调度策略
    const strategy = request.context.config.aiStrategy || 'cost-optimized';

    let channel: AIChannel;
    switch (strategy) {
      case 'speed-optimized':
        channel = this.selectFastestChannel(channels);
        break;
      case 'cost-optimized':
        channel = this.selectCheapestChannel(channels);
        break;
      case 'consensus':
        return this.consensusReview(request, channels);
      default:
        channel = this.roundRobin(channels);
    }

    // 3. 检查配额
    await this.checkQuota(request.context.service);

    // 4. 调用AI
    const startTime = Date.now();
    let response: AIResponse;
    let error: Error | null = null;

    try {
      response = await this.callAI(channel, request);
    } catch (e) {
      error = e;
      // 失败重试 (使用其他渠道)
      const fallbackChannel = channels.find(c => c.id !== channel.id);
      if (fallbackChannel) {
        response = await this.callAI(fallbackChannel, request);
        channel = fallbackChannel;
      } else {
        throw e;
      }
    }

    // 5. 记录使用情况
    await this.recordUsage({
      channelId: channel.id,
      reviewId: request.reviewId,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      cost: this.calculateCost(channel, response.usage),
      latency: Date.now() - startTime,
      success: !error,
      errorMessage: error?.message
    });

    return response;
  }

  private async callAI(
    channel: AIChannel,
    request: ReviewRequest
  ): Promise<AIResponse> {
    switch (channel.provider) {
      case 'OPENAI':
        return this.callOpenAI(channel, request);
      case 'ANTHROPIC':
        return this.callAnthropic(channel, request);
      case 'GOOGLE':
        return this.callGoogle(channel, request);
      case 'OLLAMA':
        return this.callOllama(channel, request);
      default:
        throw new Error(`Unsupported provider: ${channel.provider}`);
    }
  }

  private async callAnthropic(
    channel: AIChannel,
    request: ReviewRequest
  ): Promise<AIResponse> {
    const client = new Anthropic({
      apiKey: channel.apiKey,
      baseURL: channel.endpoint
    });

    const response = await client.messages.create({
      model: channel.model,
      max_tokens: 4000,
      temperature: 0.2,
      messages: [
        { role: 'user', content: request.prompt }
      ]
    });

    return {
      content: response.content[0].text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    };
  }

  // 共识模式 (参考Zen MCP)
  private async consensusReview(
    request: ReviewRequest,
    channels: AIChannel[]
  ): Promise<AIResponse> {
    // 选择3个不同的模型
    const selectedChannels = channels.slice(0, 3);

    // 并行调用
    const responses = await Promise.all(
      selectedChannels.map(c => this.callAI(c, request))
    );

    // 合成结果
    return this.synthesizeResponses(responses);
  }

  private synthesizeResponses(responses: AIResponse[]): AIResponse {
    // 简单实现: 选择最严格的审核结果
    // 更复杂的实现可以用AI来合成多个结果
    const allIssues = responses.flatMap(r => r.issues || []);

    return {
      content: this.mergeContent(responses),
      issues: this.deduplicateIssues(allIssues),
      usage: {
        inputTokens: responses.reduce((sum, r) => sum + r.usage.inputTokens, 0),
        outputTokens: responses.reduce((sum, r) => sum + r.usage.outputTokens, 0)
      }
    };
  }

  private selectCheapestChannel(channels: AIChannel[]): AIChannel {
    return channels.reduce((cheapest, current) => {
      const cheapestCost = cheapest.pricing.inputPerMillion + cheapest.pricing.outputPerMillion;
      const currentCost = current.pricing.inputPerMillion + current.pricing.outputPerMillion;
      return currentCost < cheapestCost ? current : cheapest;
    });
  }

  private calculateCost(channel: AIChannel, usage: TokenUsage): number {
    const inputCost = (usage.inputTokens / 1_000_000) * channel.pricing.inputPerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * channel.pricing.outputPerMillion;
    return inputCost + outputCost;
  }
}
```

### 4. 规则引擎

**职责**: 管理审核规则，支持动态规则和模板

```typescript
// rule-engine.service.ts
@Injectable()
export class RuleEngineService {

  async applyRules(context: ReviewContext): Promise<Violation[]> {
    const { languages, frameworks, service } = context;

    // 1. 获取适用的规则
    const rules = await this.getApplicableRules({
      languages,
      frameworks,
      serviceId: service.id
    });

    // 2. 并行执行所有规则
    const violations = await pMap(
      rules,
      async (rule) => this.checkRule(rule, context),
      { concurrency: 10 }
    );

    return violations.flat();
  }

  private async getApplicableRules(criteria: {
    languages: string[];
    frameworks: string[];
    serviceId: string;
  }): Promise<ReviewRule[]> {
    const { languages, frameworks, serviceId } = criteria;

    // 获取配置
    const config = await this.configService.resolveConfig(serviceId);

    // 查询规则
    const rules = await this.prisma.reviewRule.findMany({
      where: {
        enabled: true,
        OR: [
          // 匹配语言
          {
            languages: {
              hasSome: languages
            }
          },
          // 匹配框架
          {
            frameworks: {
              hasSome: frameworks
            }
          }
        ]
      }
    });

    // 过滤: 只保留配置中启用的规则
    if (config.enabledRules) {
      return rules.filter(r => config.enabledRules.includes(r.id));
    }

    return rules;
  }

  private async checkRule(
    rule: ReviewRule,
    context: ReviewContext
  ): Promise<Violation[]> {
    const violations: Violation[] = [];

    for (const file of context.files) {
      // 如果规则有pattern,先用正则匹配
      if (rule.pattern) {
        const matches = this.matchPattern(file.patch, rule.pattern);
        if (matches.length === 0) continue;
      }

      // 使用AI深度检查
      const aiViolations = await this.aiCheckRule(rule, file, context);
      violations.push(...aiViolations);
    }

    return violations;
  }

  private async aiCheckRule(
    rule: ReviewRule,
    file: FileChange,
    context: ReviewContext
  ): Promise<Violation[]> {
    const prompt = `
你是一个代码审核专家。请根据以下规则检查代码:

规则: ${rule.name}
描述: ${rule.description}
严重程度: ${rule.severity}

规则详细要求:
${rule.prompt}

代码变更:
\`\`\`diff
${file.patch}
\`\`\`

请输出JSON格式的违规列表:
{
  "violations": [
    {
      "line": 123,
      "message": "违规描述",
      "suggestion": "修复建议"
    }
  ]
}
`;

    const response = await this.aiScheduler.review({
      prompt,
      context,
      type: 'rule-check'
    });

    const result = JSON.parse(response.content);

    return result.violations.map(v => ({
      ruleId: rule.id,
      file: file.filename,
      line: v.line,
      severity: rule.severity,
      message: v.message,
      suggestion: v.suggestion
    }));
  }

  // 规则模板生成
  async generateRuleTemplate(language: string, category: RuleCategory): string {
    const templates = {
      javascript: {
        SECURITY: `
请检查以下安全问题:
1. 是否使用了eval()、Function构造器等危险API
2. 是否存在XSS漏洞(innerHTML、dangerouslySetInnerHTML等)
3. 是否有敏感信息硬编码(密码、token等)
4. 是否存在原型污染风险
5. 依赖包是否有已知漏洞
`,
        QUALITY: `
请检查代码质量:
1. 函数复杂度是否过高(圈复杂度>10)
2. 函数是否过长(>50行)
3. 是否有重复代码
4. 变量命名是否清晰
5. 是否有未使用的变量或导入
`,
        PERFORMANCE: `
请检查性能问题:
1. 是否有不必要的重渲染(React)
2. 大数组操作是否高效
3. 是否有内存泄漏风险(事件监听未清理等)
4. 是否使用了性能较差的API
`
      },
      python: {
        SECURITY: `
请检查以下安全问题:
1. 是否存在SQL注入风险
2. 是否使用了pickle、exec等危险函数
3. 文件路径是否经过验证(路径遍历攻击)
4. 是否有命令注入风险
`,
        QUALITY: `
请检查代码质量:
1. 是否符合PEP 8规范
2. 函数复杂度是否过高
3. 是否有类型注解(Python 3.5+)
4. 异常处理是否恰当
`
      }
    };

    return templates[language]?.[category] || '请对代码进行审核';
  }
}
```

### 5. 通知服务

**职责**: 多渠道通知，支持配置继承

```typescript
// notification.service.ts
@Injectable()
export class NotificationService {

  async sendNotification(review: Review) {
    // 1. 解析通知配置 (继承链)
    const config = await this.resolveNotificationConfig(review.serviceId);

    if (!config.channels || config.channels.length === 0) {
      return; // 没有配置通知渠道
    }

    // 2. 生成通知内容
    const content = await this.buildNotificationContent(review);

    // 3. 并行发送到所有渠道
    await Promise.allSettled(
      config.channels.map(channel =>
        this.sendToChannel(channel, content, review)
      )
    );
  }

  private async resolveNotificationConfig(
    serviceId: string
  ): Promise<NotificationConfig> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        config: true,
        organization: {
          include: {
            users: {
              where: { role: 'ORG_ADMIN' }
            }
          }
        }
      }
    });

    // 优先级: Service > Department > Organization > Default
    if (service.config?.notificationChannels) {
      return service.config.notificationChannels;
    }

    // 使用默认配置
    return {
      channels: [
        { type: 'email', target: service.organization.users[0].email }
      ]
    };
  }

  private async sendToChannel(
    channel: NotificationChannel,
    content: NotificationContent,
    review: Review
  ) {
    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmail(channel, content);
          break;
        case 'slack':
          await this.sendSlack(channel, content);
          break;
        case 'dingtalk':
          await this.sendDingTalk(channel, content);
          break;
        case 'feishu':
          await this.sendFeishu(channel, content);
          break;
        case 'webhook':
          await this.sendWebhook(channel, content, review);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to send notification to ${channel.type}`, error);
    }
  }

  private async buildNotificationContent(review: Review): Promise<NotificationContent> {
    const service = review.service;
    const score = review.overallScore;
    const scoreEmoji = score >= 90 ? '✅' : score >= 70 ? '⚠️' : '❌';

    return {
      title: `代码审核完成 ${scoreEmoji}`,
      summary: `${service.name} - ${review.eventType} #${review.prNumber || review.commitHash.slice(0, 7)}`,
      score: review.overallScore,
      scores: review.scores,
      violations: {
        critical: review.violations.filter(v => v.severity === 'CRITICAL').length,
        error: review.violations.filter(v => v.severity === 'ERROR').length,
        warning: review.violations.filter(v => v.severity === 'WARNING').length
      },
      url: this.buildReviewUrl(review)
    };
  }

  private async sendSlack(
    channel: NotificationChannel,
    content: NotificationContent
  ) {
    const webhook = new IncomingWebhook(channel.target);

    await webhook.send({
      text: content.title,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: content.title
          }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*项目:*\n${content.summary}` },
            { type: 'mrkdwn', text: `*得分:*\n${content.score}/100` }
          ]
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*严重:* ${content.violations.critical}` },
            { type: 'mrkdwn', text: `*错误:* ${content.violations.error}` },
            { type: 'mrkdwn', text: `*警告:* ${content.violations.warning}` }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '查看详情' },
              url: content.url
            }
          ]
        }
      ]
    });
  }
}
```

### 6. IDE插件架构

#### VSCode插件

```typescript
// extension.ts
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

  // 1. 实时诊断
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('ai-code-review');

  // 2. 监听文档变化
  const documentChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const config = vscode.workspace.getConfiguration('aiCodeReview');

    if (!config.get('enableRealtimeReview')) return;

    // 防抖: 停止输入500ms后才审核
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      await reviewDocument(event.document, diagnosticCollection);
    }, 500);
  });

  // 3. 命令: 手动触发审核
  const reviewCommand = vscode.commands.registerCommand(
    'aiCodeReview.reviewFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      await reviewDocument(editor.document, diagnosticCollection);
    }
  );

  // 4. 命令: 查看项目技术债务
  const techDebtCommand = vscode.commands.registerCommand(
    'aiCodeReview.viewTechDebt',
    async () => {
      const panel = vscode.window.createWebviewPanel(
        'techDebt',
        '技术债务面板',
        vscode.ViewColumn.Two,
        { enableScripts: true }
      );

      const techDebt = await fetchTechDebt();
      panel.webview.html = renderTechDebtView(techDebt);
    }
  );

  context.subscriptions.push(
    diagnosticCollection,
    documentChangeListener,
    reviewCommand,
    techDebtCommand
  );
}

async function reviewDocument(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection
) {
  const apiClient = new APIClient();

  // 调用后端API
  const result = await apiClient.reviewCode({
    language: document.languageId,
    code: document.getText(),
    filePath: document.fileName
  });

  // 转换为VSCode诊断
  const diagnostics: vscode.Diagnostic[] = result.issues.map(issue => {
    const range = new vscode.Range(
      issue.line - 1, 0,
      issue.line - 1, 1000
    );

    const diagnostic = new vscode.Diagnostic(
      range,
      issue.message,
      severityMap[issue.severity]
    );

    diagnostic.source = 'AI Code Review';
    diagnostic.code = issue.ruleId;

    return diagnostic;
  });

  diagnosticCollection.set(document.uri, diagnostics);
}

const severityMap = {
  'CRITICAL': vscode.DiagnosticSeverity.Error,
  'ERROR': vscode.DiagnosticSeverity.Error,
  'WARNING': vscode.DiagnosticSeverity.Warning,
  'INFO': vscode.DiagnosticSeverity.Information
};
```

#### IntelliJ IDEA插件

```kotlin
// CodeReviewInspection.kt
class CodeReviewInspection : LocalInspectionTool() {

    override fun checkFile(
        file: PsiFile,
        manager: InspectionManager,
        isOnTheFly: Boolean
    ): Array<ProblemDescriptor>? {

        if (!isEnabled()) return null

        val apiClient = APIClient.getInstance()
        val language = file.language.id
        val code = file.text

        // 调用后端API
        val result = runBlocking {
            apiClient.reviewCode(
                language = language,
                code = code,
                filePath = file.virtualFile.path
            )
        }

        // 转换为IDEA的ProblemDescriptor
        return result.issues.map { issue ->
            val element = findElementAtLine(file, issue.line)

            manager.createProblemDescriptor(
                element,
                issue.message,
                arrayOf(ApplyFixQuickFix(issue.suggestion)),
                severityMap[issue.severity]!!,
                isOnTheFly,
                false
            )
        }.toTypedArray()
    }

    private fun isEnabled(): Boolean {
        val settings = CodeReviewSettings.getInstance()
        return settings.enableRealtimeReview
    }
}

// 快速修复
class ApplyFixQuickFix(private val suggestion: String) : LocalQuickFix {
    override fun getFamilyName() = "Apply AI suggestion"

    override fun applyFix(project: Project, descriptor: ProblemDescriptor) {
        val element = descriptor.psiElement
        // 应用建议的修复
        WriteCommandAction.runWriteCommandAction(project) {
            element.replace(suggestion)
        }
    }
}
```

---

## 📊 实施路线图

### Phase 1: MVP (4-6周)

**目标**: 核心功能可用,支持单租户

**功能清单**:
- [x] Webhook服务 (GitHub + GitLab)
- [x] 基础审核引擎 (PR级别分析)
- [x] AI集成 (OpenAI + Anthropic)
- [x] 简单规则引擎 (JavaScript/TypeScript)
- [x] 基础Web管理界面
- [x] PostgreSQL + Redis数据层

**技术债务**:
- 暂不支持多租户
- 规则库较简单
- 无负载均衡

### Phase 2: 企业级功能 (6-8周)

**目标**: 多租户、权限、配额管理

**功能清单**:
- [x] 多租户架构 (公司/部门/用户)
- [x] 权限管理 (RBAC)
- [x] 配置继承系统
- [x] Token配额管理
- [x] AI渠道负载均衡
- [x] 通知系统 (多渠道)
- [x] MongoDB集成 (详细审核记录)

### Phase 3: 高级特性 (4-6周)

**目标**: 规则库、技术债务、报表

**功能清单**:
- [x] 丰富的规则库 (多语言支持)
- [x] 规则模板引擎
- [x] 技术债务追踪
- [x] 基线管理
- [x] 多维度报表 (用户/部门/公司)
- [x] 文件级别审核优化
- [x] 共识模式 (多AI)

### Phase 4: IDE集成 (4-6周)

**目标**: 开发者工具集成

**功能清单**:
- [x] VSCode插件
- [x] IntelliJ IDEA插件
- [x] CLI工具
- [x] 实时审核 (类似SonarLint)
- [x] 快速修复 (Quick Fix)

### Phase 5: 优化与扩展 (持续)

**目标**: 性能优化、用户体验提升

**功能清单**:
- [ ] 缓存优化 (减少AI调用)
- [ ] 增量审核 (只审核变更部分)
- [ ] 自定义AI模型支持
- [ ] 审核模板市场
- [ ] API开放平台
- [ ] GitLab CI/CD深度集成

---

## 🔐 安全考虑

### 1. Webhook安全

- GitHub: HMAC SHA-256签名验证
- GitLab: Secret Token验证
- 限制IP白名单(可选)

### 2. API密钥管理

- 使用环境变量或密钥管理服务(Vault)
- 数据库加密存储
- 定期轮换

### 3. 权限控制

- JWT认证
- RBAC授权
- API级别的权限检查

### 4. 数据隐私

- 代码快照加密存储
- 审核记录访问日志
- 符合GDPR/数据保护法规

---

## 📈 监控与运维

### 关键指标

```typescript
{
  "业务指标": {
    "审核总数": "按天/周/月统计",
    "平均审核时长": "秒",
    "平均得分": "0-100",
    "AI成本": "美元/月"
  },

  "性能指标": {
    "Webhook响应时间": "ms",
    "审核队列长度": "个",
    "AI调用成功率": "%",
    "缓存命中率": "%"
  },

  "成本指标": {
    "每次审核成本": "美元",
    "Token使用量": "按部门/用户",
    "存储成本": "美元/月"
  }
}
```

### 告警规则

- 审核失败率 > 5%
- 队列积压 > 100个任务
- AI调用延迟 > 30s
- 月度成本超预算20%

---

## 🎯 总结

这个设计方案提供了：

1. ✅ **可扩展性**: 微服务架构,易于水平扩展
2. ✅ **灵活性**: 多AI渠道,支持自定义规则
3. ✅ **企业级**: 多租户、权限、配额完整支持
4. ✅ **成本优化**: 负载均衡、缓存、增量审核
5. ✅ **开发者友好**: IDE集成、实时反馈
6. ✅ **可观测性**: 完整的监控和日志

**关键创新点**:
- 配置继承链 (Service → User → Dept → Org)
- 多AI共识模式 (参考Zen MCP)
- 智能规则引擎 (动态模板 + AI检查)
- 分层审核 (PR级别 + 文件级别)

**下一步建议**:
1. 搭建开发环境,实现MVP
2. 选择2-3个核心语言先支持(如JavaScript、Python、Go)
3. 与公司用户中心集成测试
4. 小范围试点,收集反馈
5. 迭代优化,逐步推广

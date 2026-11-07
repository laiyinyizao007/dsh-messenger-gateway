# dsh-messenger-gateway — 本地 fork

上游：[GooDAnDReaDY/dsh-messenger-gateway](https://github.com/GooDAnDReaDY/dsh-messenger-gateway) `@goodandready/dsh-messenger-gateway@0.4.29`（MIT）。

这个 fork 让 Telegram 从「另一条平行对话」变成**网页端的遥控器**，并修掉了上游一个会让每条回复都失败的 bug。

## 改了什么（5 个提交）

| 提交 | 内容 |
| --- | --- |
| `feat: speak the task-completion notice as a Telegram voice note` | 网页任务完成时，除了文字通知，还发一条**语音条**（走 dsh-tts，ffmpeg 转 OGG/Opus）。开关 `tts.notifyVoice` |
| `feat: route inbound messages into existing web sessions` | **路由**：每条 Telegram 消息先判断「这是哪个网页会话」，再**注入那个会话**，而不是另开一条 `msgw-*` 会话。上下文全在网页，Telegram 只是遥控器 |
| `chore: log the routing decision and the turn failure stack` | 路由决策与失败堆栈进日志 |
| `chore: write gateway failures to a file the rate-limited host log cannot drop` | 失败写 `~/.dsh/profiles/web/messenger-gateway-errors.log`（宿主日志会限流丢弃，关键那行经常被丢） |
| `fix: the reply text was const, so the cost footer broke every reply` | **上游 bug 修复**（见下） |

## 上游的 bug（已修，值得回报）

```js
const answer = processed.text     // lib/gateway-turn.js:323
...
if (footer) answer += footer     // lib/gateway-turn.js:361 —— 给 const 赋值
```

只要打开 `telegram.costFooter`，**每一条回复都会在发出之前**抛
`TypeError: Assignment to constant variable.`，表现为 Telegram 里收到
「内部处理异常: Assignment to constant variable.」。

上游默认值是 `costFooter: false`，所以这条路径他们自己跑不到。
修复是一行：`const answer` → `let answer`。

`test/turn.test.mjs` 里有守卫测试，防止再犯。

## 路由是怎么判断的

1. **点名**：消息里出现项目的目录名或标题（「去响应式那个项目」）→ 命中。
2. **沿用**：消息没指向别的项目（「接着刚才那个」）→ 留在上次那个会话。
3. **模型**：都没匹配 → 一次便宜的小模型调用，把候选会话列表给它，让它选编号。

命中之后：消息注入那个会话（浏览器里立刻能看到，同一份上下文），
回复再回到 Telegram（文字 + 语音条）。从 Telegram 发起的那一轮，完成通知
不再重复推第二遍（exactly-once）。

配置项在 `sessionRouting`：

```yaml
sessionRouting:
  enabled: true
  llmRoute: true       # 让模型兜底判断
  stickToLast: true    # 「接着刚才那个」
  maxCandidates: 12
```

## 安装（本机）

profile 的 `package.json` 里指向本目录：

```json
"@goodandready/dsh-messenger-gateway": "link:/home/averypi/dsh-messenger-gateway-local"
```

```bash
cd ~/.dsh/profiles/web && pnpm install
```

## 测试

```bash
node --test test/*.test.mjs
```

- `test/router.test.mjs`：路由判断（按名匹配 / 模型选择 / 模型挂掉时降级 / 候选合并）。
- `test/turn.test.mjs`：回复文本必须是 `let`；以及「不给 const 赋值」的源码守卫。

## 同步上游

```bash
git remote add upstream https://github.com/GooDAnDReaDY/dsh-messenger-gateway.git
git fetch upstream
git checkout -b sync/upstream main && git merge upstream/main
```

改动都是局部的，冲突面很小；`const answer` 那行上游修好后，可以删掉对应的
`let` 改动。

## 许可

上游 MIT，本 fork 同样 MIT。

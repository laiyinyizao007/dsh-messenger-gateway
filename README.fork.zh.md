# dsh-messenger-gateway — 本地 fork

上游：[GooDAnDReaDY/dsh-messenger-gateway](https://github.com/GooDAnDReaDY/dsh-messenger-gateway) `@goodandready/dsh-messenger-gateway@0.4.29`（MIT）。

本 fork 只改了一处：**网页任务完成时，除了文字通知，还发一条 Telegram 语音条。**

## 为什么改

上游的 notify bridge 在 `turn/end` 时往 Telegram home 推一条纯文字：

```
【Task completed】
session: <id>
duration: 42s
```

手机锁屏或塞在兜里时，这条文字等于没看见。用户的原话是「每次完成任务就给我语音播报」。

## 改了什么

`lib/index.js` 的 notify bridge 块：

1. 新增 `session/event` 监听 `assistant/message`，按会话 id 记住最后一条助手答复的纯文本。
2. `turn/end` 时据此拼一条本地化通知（`defaultLocale: zh` 时是中文）：
   「【任务完成】/ 会话：xxx / 用时：42 秒 / <答复摘要>」。
3. 若 `tts.notifyVoice` 为真，把同一段话经 dsh-tts 合成，ffmpeg 转成 OGG/Opus，
   以 Telegram voice note 形式发出（`sendVoice`）。

新增配置（在 `lib/config.js` 的 `tts` 段，均为 volatile，可在设置卡里改）：

| 键 | 默认 | 含义 |
|---|---|---|
| `tts.notifyVoice` | `false` | 完成通知是否同时发语音条（关掉就是上游行为） |
| `tts.notifyVoiceMaxChars` | `160` | 语音里带多少助手答复的摘要 |

## 依赖

- `@goodandready/dsh-tts` 必须在同一个 profile 里（语音合成走它的 `/dsh-tts/speak`）。
- 合成引擎在本机是 Edge TTS CLI：`/home/averypi/.dsh/voice-venv/bin/edge-tts`。

## 安装方式（本机）

profile 的 `package.json` 里指向本目录：

```json
"@goodandready/dsh-messenger-gateway": "link:/home/averypi/dsh-messenger-gateway-local"
```

```bash
cd ~/.dsh/profiles/web && pnpm install
```

## 跟上游同步

```bash
git remote add upstream https://github.com/GooDAnDReaDY/dsh-messenger-gateway.git
git fetch upstream
git checkout -b sync/upstream main && git merge upstream/main
# 把 notify bridge 那段改动 re-apply 回去（见 git show 9f04866）
```

改动只有一个 commit，冲突面很小。

## 许可

上游 MIT，本 fork 同样 MIT。

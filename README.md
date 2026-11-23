# info-band

**English** · [中文](#中文)

A Claude Code plugin that adds a compact info band above the prompt box: a live clock, your usage limits, session stats and cache hit rate — in English or Chinese, with a selectable time zone and built-in update check.

```
Monday, November 23, 2026  │  06:05:14 SGT                              中 ▾ ×
5h ━━━━━━ 42% ↻2h 13m  ·  Week ━━━━━━ 18% ↻3d 4h  ·  Session 12:03  ·  Last 0:41  ·  Token 1.24M  ·  $0.86
Cache hit ━━━━━━━━━━━━ 92.1%   read 1.10M · write 96K
```

## Features

- **Clock** — full date with weekday, 24-hour time to the second, and the time zone abbreviation. Refreshes every second.
- **Time zone** — Singapore by default. Pick another from the expanded view (▾): Beijing / Shanghai, Hong Kong, Taipei, Tokyo, Seoul, India, Dubai, London, Paris / Berlin, US Eastern / Central / Mountain / Pacific, Sydney, UTC, or this computer's own zone. Daylight saving time is handled automatically (e.g. EST ↔ EDT).
- **Language** — English by default. Click **中** to switch to Chinese, **EN** to switch back. Your choice of language and time zone is remembered across sessions.
- **Usage limits** — 5-hour limit and weekly limit, each with a bar, percentage and time until reset. When the current model is Fable, the Fable weekly limit is shown if available; otherwise the all-models weekly limit.
- **Session stats** — session length, current / last turn duration, total tokens and estimated cost.
- **Cache hit rate** — cache reads ÷ all input tokens, with cache read / write totals. Green ≥ 80%, amber 50–80%, red < 50%.
- **Details (▾)** — model, input / output tokens, turns and tool calls, and the time zone picker. **×** collapses the band to a single button.
- **Update check** — checks this GitHub repository once a minute. When a newer version is out, the band shows `Update available  current vX → latest vY` with an **Update now** button that updates and reloads the plugin for you.

Usage limits come from the API responses of a subscription account, so they appear after your first message. Accounts billed per API usage have no limit data and show `—`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install info-band --marketplace Keven-03/claude-info-band
```

From a shell:

```
claude plugin install info-band --marketplace Keven-03/claude-info-band
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Keven-03/claude-info-band`, then **Add plugin**.

New sessions show the band automatically. In a session that is already open, run `/reload-plugins`.

## Update

Click **Update now** on the band, or run:

```
claude plugin marketplace update claude-info-band
claude plugin update info-band@claude-info-band
```

Then run `/reload-plugins` or reopen the window.

## License

[MIT](LICENSE)

---

<a id="中文"></a>

# info-band

[English](#info-band) · **中文**

一个 Claude Code 插件：在输入框上方显示一条紧凑的信息栏，包括实时时钟、用量额度、会话统计和缓存命中率。支持中英文切换、可选时区，并会自动检查更新。

```
2026年11月23日 星期一  │  06:05:14 SGT                                  EN ▾ ×
5h ━━━━━━ 42% ↻2时13分  ·  周额 ━━━━━━ 18% ↻3天4时  ·  会话 12:03  ·  上轮 0:41  ·  Token 1.24M  ·  $0.86
缓存命中率 ━━━━━━━━━━━━ 92.1%   读 1.10M · 写 96K
```

## 功能

- **时钟**：完整日期和星期，24 小时制时间精确到秒，后面带时区缩写，每秒刷新。
- **时区**：默认新加坡。点 ▾ 展开后可以选择其他时区：北京 / 上海、香港、台北、东京、首尔、印度、迪拜、伦敦、巴黎 / 柏林、美东、美中、美山地、美西、悉尼、UTC，或者跟随电脑。有夏令时的地区会自动切换（例如 EST ↔ EDT）。
- **语言**：默认英文，点 **中** 切换成中文，点 **EN** 切回英文。语言和时区的选择会记住，下次打开还是你选的。
- **用量额度**：5 小时额度和周额度，各有进度条、百分比和距离重置的时间。当前模型是 Fable 时，如果有 Fable 专属的周额度就优先显示，否则显示所有模型共用的周额度。
- **会话统计**：会话时长、本轮 / 上轮用时、Token 总量和预估费用。
- **缓存命中率**：缓存读取 ÷ 全部输入 token，后面附缓存读写量。80% 以上绿色，50%–80% 黄色，低于 50% 红色。
- **明细（▾）**：模型、输入 / 输出 token、轮数和工具调用次数，以及时区选择。点 **×** 收起成一个小按钮。
- **检查更新**：每分钟检查一次本仓库。有新版本时，信息栏最上面会显示「有新版本 当前 vX → 最新 vY」，点「一键更新」会自动更新并重新加载插件。

额度数据来自订阅账号的 API 返回，发出第一条消息后才有数字。按 API 用量计费的账号没有额度数据，会显示「—」。

## 安装

在 Claude Code 终端里输入：

```
/plugin install info-band --marketplace Keven-03/claude-info-band
```

或者在命令行里运行：

```
claude plugin install info-band --marketplace Keven-03/claude-info-band
```

在 Claude 桌面应用里（不能用 `/plugin`）：点输入框旁边的 **+** → **Plugins** → **Add marketplace**，填 `Keven-03/claude-info-band`，再点 **Add plugin**。

装好后新开的会话会自动显示；已经开着的会话运行 `/reload-plugins`。

## 更新

点信息栏上的「一键更新」，或手动运行：

```
claude plugin marketplace update claude-info-band
claude plugin update info-band@claude-info-band
```

然后运行 `/reload-plugins` 或重开窗口。

## 许可证

[MIT](LICENSE)

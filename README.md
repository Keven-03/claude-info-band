# info-band

A Claude Code plugin that adds a compact info band above the prompt box.

Claude Code 插件：在输入框上方显示一条信息栏。

```
Monday, November 23, 2026  │  06:05:14 SGT                                  ▾ ×
5h ━━━━━━ 42% ↻2时13分  ·  周额 ━━━━━━ 18%  ·  会话 12:03  ·  上轮 0:41  ·  Token 1.24M  ·  $0.86
缓存命中率 ━━━━━━━━━━━━ 92.1%   读 1.10M · 写 96K
```

- 第一行：美式日期 + 24 小时制时间（新加坡时间 SGT），每秒刷新
- 第二行：5 小时额度、周额度（Fable 模型时优先显示 Fable 周额度）、会话时长、本轮/上轮用时、Token 总量、预估费用
- 第三行：缓存命中率、缓存读写量
- `▾` 展开明细（模型、输入/输出、轮数、工具调用次数），`×` 收起
- 自动检查 GitHub 上的新版本（启动时一次，之后每 6 小时一次）。有新版本时信息条最上面会显示「有新版本 当前 vX → 最新 vY」，点「一键更新」会自动更新并重新加载插件

额度数据来自订阅账号的 API 返回，发出第一条消息后才有数字；按 API 计费的账号没有额度数据，会显示「—」。

## 安装 / Install

At the prompt of a Claude Code terminal session:

```
/plugin install info-band --marketplace Keven-03/claude-info-band
```

From a shell:

```
claude plugin install info-band --marketplace Keven-03/claude-info-band
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Keven-03/claude-info-band`, then **Add plugin**.

安装后新开的会话会自动显示；已经开着的会话运行 `/reload-plugins`。

## 更新 / Update

点信息条上的「一键更新」，或手动运行：

```
claude plugin marketplace update claude-info-band
claude plugin update info-band@claude-info-band
```

然后运行 `/reload-plugins` 或重开窗口。

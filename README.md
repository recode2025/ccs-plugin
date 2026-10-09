# ccs-api

![NPM Version](https://img.shields.io/npm/v/@frexdeveloper/hydrooj-plugin-ccs)

为 Hydro OJ 中的 ACM/ICPC 赛制比赛添加部分 CCS(Contest Control System) API 支持

## 特别提醒

开源项目不提供任何技术支持，如有需要，请 [添加 Hydro 官方 QQ 群联系群主咨询](https://qm.qq.com/q/NsYu3dNXa2)

## 已支持

- `/api`
- `/api/contests`
- `/api/contests/<contestId>`
- `/api/contests/<contestId>/state`
- `/api/contests/<contestId>/languages`
- `/api/contests/<contestId>/problems`
- `/api/contests/<contestId>/teams`
- `/api/contests/<contestId>/organizations`
- `/api/contests/<contestId>/groups`
- `/api/contests/<contestId>/judgement-types`
- `/api/contests/<contestId>/submissions`
- `/api/contests/<contestId>/judgements`
- `/api/contests/<contestId>/runs`
- `/api/contests/<contestId>/event-feed` (支持 `stream` 和 `since_token` 查询参数)

## 未支持

- `webhooks` 接口
- `scoreboard` 接口
- `Persons` 接口

## 未计划支持

- `Awards` 接口
- `Accounts` 接口
- `Commentary` 接口
- `Clarifications` 接口
- 部分 `POST` / `PUT` / `PATCH` 接口

## How to use

- 安装插件并重启 Hydro OJ

```bash
yarn global add @frexdeveloper/hydrooj-plugin-ccs
hydrooj addon add @frexdeveloper/hydrooj-plugin-ccs
pm2 restart hydrooj
```

- 创建好 ACM/ICPC 赛制比赛，并将时间、题目、队伍等等一系列赛前设置全部设置完善，保持在随时可以开始比赛的状态即可。

> [!CAUTION]
> 本插件只考虑正规 XCPC 比赛场景，即假设比赛中途不会改动任何有关比赛设置、队伍、题目等一系列赛前应该设置完善的数据。如果迫不得已需要改动，请联系管理员[重置比赛 CCS 数据并重新初始化](#注意事项)
>
> 如果比赛中途重新初始化比赛，请重置 CDS Event-Feed 缓存，否则 CDS 会出现数据混乱。

- 进入 “控制面板-配置管理” 修改 CCS 账户的默认密码：

![](./images/change-default-passwd.png)

- 确定以上所有比赛的赛前基本设置均已设置完毕且不再改变后，进入比赛详情页面，点击右侧菜单栏中的 “(CCS) 初始化比赛” 按钮对比赛数据初始化：

![](./images/init-contest.png)

- 使用 ICPC Tools CDS 连接 CCS，CCS URL 格式为：  
`http(s)://<domain>/ccs/api/contests/<ContestId>`
- 如果你的比赛在特定的域中，那么预期的 URL 格式应为：  
`http(s)://<domain>/d/<domainId>/ccs/api/contests/<ContestId>`

- 若配置无误，CDS 将会按预期正常工作。

![](./images/cds.png)

> [!TIP]
> 比赛 ID 就在你进入比赛详情页面后的 URL 里：
>
> 形如 `http(s)://xxxx/contest/68ead09f61ab6063d9fcd417`，比赛 ID 就是 `68ead09f61ab6063d9fcd417`

## 注意事项

在初始化后如果出现比赛数据混乱或改动了任何有关比赛设置、队伍、题目等赛前数据，进入比赛详情页面，点击 “(CCS) 重置比赛” 对比赛数据进行重置。随后再点击 “(CCS) 初始化比赛” 重新初始化比赛数据：

> [!CAUTION]
> 注意此操作会将此比赛的 CCS Events 以及数据全部清空，重新初始化后按预期会恢复目前比赛已有的所有事件。

![](./images/reset-contest.png)

## Ledo（乐多赛）接入 ICPC Tools

除 ACM/ICPC 赛制外，CCS API 也支持 Ledo 赛制，可以沿用 CCS → CDS → Presentation Client / Resolver 的流程投屏和滚榜。操作步骤与 ACM 比赛相同（“(CCS) 初始化比赛”按钮在 Ledo 比赛中同样可用），插件会自动按分数赛输出数据：

- `contest.scoreboard_type` 为 `score`，`problems.max_score` 为题目分值（默认 100）
- 每条 `judgement` 带 `score`，即该次提交按 Ledo 规则衰减后的得分：`round(max(0.7, 0.95^(n-1)) * 原始分) * 题目分值比例`
- ICPC Tools 在分数赛中只对 `solved=true` 的判题结果计分，因此有部分分的非 AC 提交，判题类型会标记为 `PA`（Partially Accepted，`solved=true`）
- ICPC Tools 每题取最高分，与 Hydro 的 Ledo 计分结果一致

> [!NOTE]
> - 比赛中实时投屏：未封榜时 Presentation Client 会实时重排；封榜后新提交显示为待定，需要在比赛中设置“封榜时间”。
> - 排名并列时，ICPC Tools 会按“最后一次提分时间”早者在前排序，而 Hydro 的 Ledo 榜单将同分队伍视为并列。
> - 在更新本插件前已初始化的 Ledo 比赛，需要先“(CCS) 重置比赛”再“(CCS) 初始化比赛”，并重置 CDS 的 Event-Feed 缓存。

## Ledo（乐多赛）滚榜

插件为 Ledo 赛制提供了内置滚榜页面，不依赖 ICPC Tools，计分规则与 Hydro 的 Ledo 赛制完全一致（第 n 次有效提交得分乘以 `max(0.7, 0.95^(n-1))`，每题取最高，CE / FE 不计次数）。

- 创建 Ledo 赛制比赛时设置“封榜时间”。插件会让 Ledo 赛制在封榜期间真正封榜：榜单只计算封榜前的提交，封榜后的提交显示为待定（橙色 `+N`）。比赛结束后，在榜单页“解除封榜”前，选手看不到他人提交的结果。
  - 如不需要此行为，可在“控制面板-配置管理”中关闭 `ledoFreeze`。
- 比赛结束后，比赛所有者或拥有“查看隐藏榜单”权限的用户进入比赛榜单，切换到 **“滚榜”** 视图，即：
  `http(s)://<domain>/d/<domainId>/contest/<ContestId>/scoreboard/resolver`
- 滚榜从最后一名开始，每次揭晓当前队伍的一道封榜题目，并实时重新排序：

| 按键 | 作用 |
| --- | --- |
| 空格 / → / Enter | 揭晓下一项 |
| Backspace / ← | 撤销上一步 |
| A | 自动播放 开/关 |
| End | 全部揭晓 |
| F | 全屏 |
| H | 显示 / 隐藏帮助 |

> [!TIP]
> 滚榜页面只读取数据，不会改变比赛状态。滚榜结束后，请在榜单页手动“解除封榜”，公开最终榜单。

## PRs welcome ~
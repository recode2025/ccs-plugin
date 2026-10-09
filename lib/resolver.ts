import {
    ContestModel, Context, getAlphabeticId, PERM, ProblemModel, STATUS, Tdoc, Types, UserModel,
} from 'hydrooj';

// 滚榜数据：直接取 tsdoc.journal（与 Hydro 计算 ledo 成绩所用的数据一致），由前端按 ledo 规则计分
export async function getResolverData(tdoc: Tdoc) {
    const [pdict, tsdocs] = await Promise.all([
        ProblemModel.getList(tdoc.domainId, tdoc.pids, true, false, ProblemModel.PROJECTION_CONTEST_DETAIL, true),
        ContestModel.getMultiStatus(tdoc.domainId, { docId: tdoc._id }).toArray(),
    ]);
    const udict = await UserModel.getList(tdoc.domainId, tsdocs.map((i) => i.uid));
    const submissions = tsdocs.flatMap((tsdoc) => (tsdoc.journal || [])
        .filter((j) => tdoc.pids.includes(j.pid))
        .map((j) => ({
            team: tsdoc.uid,
            pid: j.pid,
            time: j.rid.getTimestamp().getTime(),
            score: j.score || 0,
            // ledo 规则中 CE / FE 不计入尝试次数，也不得分
            valid: ![STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_FORMAT_ERROR].includes(j.status),
            accepted: j.status === STATUS.STATUS_ACCEPTED,
        })));
    submissions.sort((a, b) => a.time - b.time);
    return {
        title: tdoc.title,
        beginAt: tdoc.beginAt.getTime(),
        endAt: tdoc.endAt.getTime(),
        lockAt: tdoc.lockAt ? tdoc.lockAt.getTime() : null,
        problems: tdoc.pids.map((pid, index) => ({
            id: pid,
            label: getAlphabeticId(index),
            title: pdict[pid]?.title || '',
            rate: (tdoc.score?.[pid] || 100) / 100,
        })),
        teams: tsdocs.map((tsdoc) => {
            const udoc = udict[tsdoc.uid];
            return {
                id: tsdoc.uid,
                name: udoc?.displayName || udoc?.uname || `${tsdoc.uid}`,
                school: udoc?.school || '',
                unrank: !!tsdoc.unrank,
            };
        }),
        submissions,
    };
}

export function registerResolverView(ctx: Context) {
    ctx.inject(['scoreboard'], ({ scoreboard }) => {
        scoreboard.addView('resolver', '滚榜', { tdoc: 'tdoc', json: Types.Boolean }, {
            async display({ tdoc, json }) {
                // 滚榜会暴露封榜后的结果，仅比赛所有者或有隐藏榜单权限者可用
                if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
                if (json || this.request.json) {
                    this.response.body = await getResolverData(tdoc);
                } else {
                    this.response.template = 'ccs_resolver.html';
                    this.response.body = { tdoc };
                }
            },
            supportedRules: ['ledo'],
            checker() {
                return this.user.own(this.tdoc) || this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            },
        });
    });
}

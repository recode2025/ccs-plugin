import { ContestModel, ContestRule, Context } from 'hydrooj';

// Hydro 原生 ledo 赛制不处理 lockAt，比赛中榜单始终实时。
// 这里在原规则基础上补上封榜：封榜期间 score 只计封榜前的提交，
// 封榜后的提交在榜单上显示为待定，解榜（unlockScoreboard -> recalcStatus）后恢复为实时结果。
export function applyLedoFreeze(ctx: Context) {
    ctx.effect(() => {
        const original: ContestRule = ContestModel.RULES.ledo;
        if (!original) return () => { };
        const originalStat = original.stat;
        const originalRow = original.scoreboardRow;

        ContestModel.RULES.ledo = ContestModel.buildContestRule({
            showRecord: (tdoc, now) => now > tdoc.endAt && !ContestModel.isLocked(tdoc),
            stat(tdoc, journal) {
                const full = originalStat(tdoc, journal);
                // display 置空，避免解榜后残留封榜时的数据
                if (!ContestModel.isLocked(tdoc)) return { ...full, display: null };
                const isFrozen = (j) => j.rid.getTimestamp() > tdoc.lockAt;
                const frozen = originalStat(tdoc, journal.filter((j) => !isFrozen(j)));
                const display = { ...frozen.detail };
                for (const j of journal) {
                    if (!tdoc.pids.includes(j.pid) || !isFrozen(j)) continue;
                    display[j.pid] = { ...display[j.pid], npending: (display[j.pid]?.npending || 0) + 1 };
                }
                return {
                    score: frozen.score,
                    originalScore: frozen.originalScore,
                    realScore: full.score,
                    realOriginalScore: full.originalScore,
                    detail: full.detail,
                    display,
                };
            },
            async scoreboardRow(config, _, tdoc, pdict, udoc, rank, tsdoc, meta) {
                if (!tsdoc.display) return originalRow(config, _, tdoc, pdict, udoc, rank, tsdoc, meta);
                if (!config.lockAt) {
                    // 有权限查看实时榜（realtime）时，展示完整结果
                    return originalRow(config, _, tdoc, pdict, udoc, rank, {
                        ...tsdoc, score: tsdoc.realScore, originalScore: tsdoc.realOriginalScore,
                    }, meta);
                }
                const journal = (tsdoc.journal || []).filter((j) => j.rid.getTimestamp() <= config.lockAt);
                const row = await originalRow(config, _, tdoc, pdict, udoc, rank, {
                    ...tsdoc, journal, detail: tsdoc.display,
                }, meta);
                if (config.isExport) return row;
                const offset = row.length - tdoc.pids.length;
                for (const [i, pid] of tdoc.pids.entries()) {
                    const npending = tsdoc.display[pid]?.npending;
                    if (!npending) continue;
                    const node = row[offset + i];
                    if (!tsdoc.display[pid].rid) node.value = '';
                    node.value += `${node.value ? ' ' : ''}<span style="color:orange">+${npending}</span>`;
                }
                return row;
            },
        }, original);

        return () => {
            ContestModel.RULES.ledo = original;
        };
    });
}

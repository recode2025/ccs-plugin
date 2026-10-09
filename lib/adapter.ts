import crypto from 'crypto';
import {
    ContestModel, ProblemConfig, ProblemDict, ProblemModel,
    RecordDoc, STATUS, STATUS_SHORT_TEXTS, STATUS_TEXTS, Tdoc, TestCase, User,
} from 'hydrooj';
import {
    CCSContest, CCSJudgement, CCSJudgementType, CCSOrganization,
    CCSProblem, CCSRun, CCState, CCSTeam, CCSubmission,
} from './types';
import { TimeUtils } from './utils';

// ICPC Tools 的分数赛只对 solved=true 的判题结果计分，Ledo 的部分分提交使用该类型
export const PARTIAL_JUDGEMENT_TYPE: CCSJudgementType = {
    id: 'PA', name: 'Partially Accepted', penalty: false, solved: true,
};

export function isLedo(tdoc: Tdoc) {
    return tdoc.rule === 'ledo';
}

// Ledo 赛制中 CE / FE 不计入尝试次数
export function isLedoValidTry(status: number) {
    return ![STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_FORMAT_ERROR].includes(status);
}

// 按提交顺序统计每个队伍每道题的有效尝试次数（含当前提交）
export function createLedoTryCounter() {
    const counter: Record<string, number> = {};
    return (rdoc: RecordDoc) => {
        const key = `${rdoc.uid}/${rdoc.pid}`;
        if (isLedoValidTry(rdoc.status)) counter[key] = (counter[key] || 0) + 1;
        return counter[key] || 0;
    };
}

export class CCSAdapter {
    public getJudgementTypes(): CCSJudgementType[] {
        return [
            ...Object.keys(STATUS_SHORT_TEXTS).map((i) => ({
                id: STATUS_SHORT_TEXTS[i],
                name: STATUS_TEXTS[i],
                penalty: ![STATUS.STATUS_ACCEPTED, STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_SYSTEM_ERROR].includes(+i),
                solved: +i === STATUS.STATUS_ACCEPTED,
            })),
            PARTIAL_JUDGEMENT_TYPE,
        ];
    }

    public toContest(tdoc: Tdoc): CCSContest {
        return {
            id: tdoc.docId.toHexString(),
            name: tdoc.title,
            formal_name: tdoc.title,
            start_time: TimeUtils.formatTime(tdoc.beginAt),
            duration: TimeUtils.formatDuration(tdoc.endAt.getTime() - tdoc.beginAt.getTime()),
            scoreboard_type: isLedo(tdoc) ? 'score' : 'pass-fail',
            scoreboard_freeze_duration: tdoc.lockAt
                ? TimeUtils.formatDuration(tdoc.endAt.getTime() - tdoc.lockAt.getTime())
                : null,
            penalty_time: isLedo(tdoc) ? 0 : 20,
        };
    }

    public toState(tdoc: Tdoc): CCState {
        const nowTime = new Date();
        const started = (ContestModel.isOngoing(tdoc)) ? TimeUtils.formatTime(tdoc.beginAt) : null;
        const ended = ContestModel.isDone(tdoc) ? TimeUtils.formatTime(tdoc.endAt) : null;
        const frozen = tdoc.lockAt
            ? (ContestModel.isDone(tdoc) ? TimeUtils.formatTime(tdoc.lockAt) : (ContestModel.isLocked(tdoc) ? TimeUtils.formatTime(tdoc.lockAt) : null))
            : null;
        const thawed = (ContestModel.isDone(tdoc) && !ContestModel.isLocked(tdoc)) ? TimeUtils.formatTime(nowTime) : null;
        const finalized = ContestModel.isDone(tdoc) ? TimeUtils.formatTime(new Date(tdoc.endAt.getTime() + 120 * 1000)) : null;
        const end_of_updates = ContestModel.isDone(tdoc) ? TimeUtils.formatTime(new Date(tdoc.endAt.getTime() + 150 * 1000)) : null;
        return {
            started,
            frozen,
            ended,
            thawed,
            finalized,
            end_of_updates,
        };
    }

    public async toProblem(tdoc: Tdoc, pdict: ProblemDict, index: number, pid: number): Promise<CCSProblem> {
        const referenceInfo: { domainId: string, pid: number } = pdict[pid].reference;
        const referenceData = referenceInfo ? await ProblemModel.get(referenceInfo.domainId, referenceInfo.pid) : null;
        return {
            id: `${pid}`,
            label: String.fromCharCode(65 + index),
            name: pdict[pid].title,
            ordinal: index,
            color: (typeof (tdoc.balloon?.[pid]) === 'object' ? tdoc.balloon[pid].name : tdoc.balloon?.[pid]) || 'white',
            rgb: (typeof (tdoc.balloon?.[pid]) === 'object' ? tdoc.balloon[pid].color : null) || '#ffffff',
            time_limit: (((referenceData ? referenceData.config : pdict[pid].config) as ProblemConfig).timeMax) / 1000,
            test_data_count: (((referenceData ? referenceData.config : pdict[pid].config) as ProblemConfig).count),
            ...(isLedo(tdoc) ? { max_score: tdoc.score?.[pid] || 100 } : {}),
        };
    }

    public toTeam(udoc: User, unrank: boolean): CCSTeam {
        return {
            id: `team-${udoc._id}`,
            label: udoc.seat || `team-${udoc._id}`,
            name: udoc.displayName || udoc.uname,
            display_name: (unrank ? '⭐' : '') + (udoc.displayName || udoc.uname),
            organization_id: crypto.createHash('md5').update(udoc.school || udoc.uname).digest('hex'),
            group_ids: [unrank ? 'observers' : 'participants'],
        };
    }

    public toOrganization(orgId: string, udoc: User): CCSOrganization {
        return {
            id: orgId,
            name: udoc.school || udoc.uname,
            formal_name: udoc.school || udoc.uname,
        };
    }

    public toSubmission(tdoc: Tdoc, rdoc: RecordDoc): CCSubmission {
        const submitTime = TimeUtils.formatTime(rdoc._id.getTimestamp());
        const contestTime = TimeUtils.getContestTime(tdoc, rdoc._id.getTimestamp());
        return {
            id: rdoc._id.toHexString(),
            language_id: rdoc.lang?.split('.')[0],
            problem_id: `${rdoc.pid}`,
            team_id: `team-${rdoc.uid}`,
            time: submitTime,
            contest_time: contestTime,
        };
    }

    /**
     * @param ntry Ledo 赛制下该提交是此队伍此题的第几次有效尝试（含本次）
     */
    public toJudgement(tdoc: Tdoc, rdoc: RecordDoc, ntry = 1): CCSJudgement {
        let judgementTypeId = rdoc.judgeAt ? STATUS_SHORT_TEXTS[rdoc.status] : null;
        let score: number | undefined;
        if (isLedo(tdoc)) {
            // 与 Hydro Ledo 赛制一致：round(max(0.7, 0.95^(n-1)) * 原始分) * 题目分值比例
            // ICPC Tools 每题取 solved 判题中的最高分，即为 Hydro 中的每题得分
            const rate = (tdoc.score?.[rdoc.pid] || 100) / 100;
            score = (rdoc.judgeAt && isLedoValidTry(rdoc.status))
                ? Math.round(Math.max(0.7, 0.95 ** (ntry - 1)) * (rdoc.score || 0)) * rate
                : 0;
            if (score > 0 && rdoc.status !== STATUS.STATUS_ACCEPTED) judgementTypeId = PARTIAL_JUDGEMENT_TYPE.id;
        }
        return {
            id: `j-${rdoc._id.toHexString()}`,
            submission_id: rdoc._id.toHexString(),
            judgement_type_id: judgementTypeId,
            ...(score !== undefined ? { score } : {}),
            start_time: TimeUtils.formatTime(rdoc._id.getTimestamp()),
            start_contest_time: TimeUtils.getContestTime(tdoc, rdoc._id.getTimestamp()),
            end_time: rdoc.judgeAt ? TimeUtils.formatTime(rdoc.judgeAt) : null,
            end_contest_time: rdoc.judgeAt ? TimeUtils.getContestTime(tdoc, rdoc.judgeAt) : null,
        };
    }

    public toRun(tdoc: Tdoc, rdoc: RecordDoc, testCaseDoc: TestCase): CCSRun {
        return {
            id: `r-${rdoc._id.toHexString()}-${testCaseDoc.id}`,
            judgement_id: `j-${rdoc._id.toHexString()}`,
            ordinal: testCaseDoc.id,
            judgement_type_id: STATUS_SHORT_TEXTS[testCaseDoc.status],
            time: TimeUtils.formatTime(new Date(rdoc._id.getTimestamp().getTime() + testCaseDoc.time)),
            contest_time: TimeUtils.getContestTime(tdoc, new Date(rdoc._id.getTimestamp().getTime() + testCaseDoc.time)),
            run_time: testCaseDoc.time / 1000,
        };
    }
}

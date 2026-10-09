import { ObjectId, param, Types } from 'hydrooj';
import { BaseHandler } from './base';

export class JudgementTypesHandler extends BaseHandler {
    @param('contestId', Types.ObjectId)
    @param('id', Types.String, true)
    async get(domainId: string, contestId: ObjectId, id: string) {
        const judgementTypes = this.adapter.getJudgementTypes();
        if (id) {
            const judgementType = judgementTypes.find((i) => i.id === id);
            if (!judgementType) {
                this.response.status = 404;
                this.response.body = { message: 'Judgement type not found' };
                return;
            }
            this.response.body = judgementType;
        } else {
            this.response.body = judgementTypes;
        }
    }
}

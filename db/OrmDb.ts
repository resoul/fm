import Dexie from 'dexie';
import DbError from './errors/DbError';

export default class OrmDb extends Dexie{
    async oneOrError<T>(tableName: string, param: any): Promise<T> {

        if (typeof param === 'object' && param !== null && !Array.isArray(param)) {
            const row = await (this.table(tableName).where(param) as any).first(); //first not exist in typescript
            if (!row){
                const str = JSON.stringify(param);
                throw new DbError(`Row with params ${str} not found in ${tableName}`);
            }

            return row;
        }

        const id = Number(param);
        
        if (isNaN(id)){
            throw new DbError(`id = ${id} is not number`);
        }

        const row = await this.table(tableName).get(id);
        if (!row){
            throw new DbError(`Row ${id} not found in ${tableName}`);
        }

        return row;
    }
}
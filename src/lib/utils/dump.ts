import db from '@/../db/db';
import { useDateTime } from '@/state/useDateTime';
import 'dexie-export-import';
import type { ImportProgress } from 'dexie-export-import/dist/import';
import { saveAs } from 'file-saver';

export async function save() {
    const date = useDateTime.getState().dateTime;
    try {
        await db.table('currentDate').clear();
        await db.table('currentDate').put({ date });
        console.log('Current date saved to DB:', date);
        const blob = await db.export({
            prettyJson: true,
            progressCallback: (p) => {
                console.log(`Прогресс: ${p.completedRows} из ${p.totalRows}`);
                return true;
            }
        });

        saveAs(blob, "database_backup.json");

        console.log("Экспорт успешно завершен");
    } catch (error) {
        console.error("Ошибка при экспорте:", error);
    }
}

export async function upload(file: File, setProgress?: (progress: number) => void) {

    await db.import(file, {
        overwriteValues: true,
        progressCallback: (progress: ImportProgress) => {
        	if (setProgress) {
                const total = progress.totalRows || 1;
                const p = Math.round((progress.completedRows / total) * 100);
                setProgress(p);
            }
        	return true;
        }
    });

    const dateEntry = await db.table('currentDate').toCollection().first();

    if (dateEntry) {
        useDateTime.setState({ dateTime: dateEntry.date });
    }
}
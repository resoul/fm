import db from '@/../db/db';
import { CurrentDate } from '@/../db/models/CurrentDate';
import 'dexie-export-import';
import type { ImportProgress } from 'dexie-export-import/dist/import';
import { saveAs } from 'file-saver';

export async function save() {
    try {
        const date = await CurrentDate.getDateTime();
        console.log('Current date saved to DB:', date.getLocaleDate());
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
}
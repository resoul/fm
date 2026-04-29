import { useEffect, useState, useRef } from 'react';
import db from './db';

export default function useDatabaseSync() {
    const [isReady, setIsReady] = useState(false);
    const syncStarted = useRef(false); // Защита от двойного запуска

    useEffect(() => {
        if (syncStarted.current) return;
        syncStarted.current = true;

        async function syncData() {
            try {
                // 1. Проверяем ETag (хэш файла), чтобы не качать лишнее
                // const lastTag = localStorage.getItem('db_etag');

                const response = await fetch('/dump.json', {
                    // headers: lastTag ? { 'If-None-Match': lastTag } : {}
                });

                // Если статус 304, файл не менялся — сразу выходим
                // if (response.status === 304) {
                //     console.log("Данные актуальны (кэш браузера)");
                //     setIsReady(true);
                //     return;
                // }

                const newData = await response.json();
                // const newTag = response.headers.get('ETag');

                // 2. Атомарное обновление
                if (newData.formatName === 'dexie' && newData.data) {
                    const { tables } = newData.data; // Извлекаем массив таблиц из дампа

                    await db.transaction('rw', db.tables, async () => {
                        // 1. Очищаем все текущие таблицы
                        await Promise.all(db.tables.map(t => t.clear()));

                        // 2. Проходим по таблицам из дампа
                        for (const tableData of tables) {
                            const table = db.table(tableData.name);
                            if (table) {
                                await table.bulkAdd(tableData.rows); // В дампе данные лежат в .rows
                            }
                        }
                    });
                }

                // if (newTag) localStorage.setItem('db_etag', newTag);
                console.log("Данные обновлены из файла");
                setIsReady(true);
            } catch (error) {
                console.error("Ошибка синхронизации:", error);
                // Даже при ошибке разрешаем работу с тем, что есть в кэше БД
                setIsReady(true);
            }
        }

        syncData();
    }, []);

    return isReady;
}
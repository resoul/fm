# fm-core

Go-ядро симуляции футбольного матча, CLI и будущий API с Protobuf.
Реализованы этапы **A1–A7** и **B1–B7**: доменные входы, синхронный engine, сценарии команд,
запись/replay, детерминированный batch с распределениями и зеркальными сериями, in-match тренер
и откалиброванная модель полного матча (engine version `b7`).

## Требования

- Go **1.27.1** — версия закреплена директивой `go` в `go.mod`; CI читает её из этого файла.
  Для повторения проверенного окружения используйте именно эту версию (`go version`).
- Make и POSIX shell для локальных целей и smoke-проверки (macOS/Linux).
- Внешних Go-зависимостей нет. Docker, Unity, БД и запущенный API не нужны.

Установка Go: официальный [раздел загрузок](https://go.dev/dl/).
Если Go уже установлен, сравните вывод `go version` с версией выше.
Директива `go` задаёт минимум; более новый локальный toolchain Go автоматически не понижает.

## Сборка и рабочие команды

Из каталога fm-core:

```sh
make build
./bin/fm-cli help
./bin/fm-cli version
./bin/fm-cli validate --help
./bin/fm-cli validate --input fixtures/match/equal.json
./bin/fm-cli validate --input fixtures/match/equal.json --config configs/baseline.json
./bin/fm-cli validate --input fixtures/match/equal.json --config configs/short_test.json
```

Без Make: `go build -trimpath -o bin/fm-cli ./cmd/fm-cli`.
Без аргументов CLI выводит справку. Поддерживаются также `--help`, `-h` и `--version`.
Версия `0.1.0-dev` обозначает текущую разработку до первого релиза.

## Команды

`run` читает fixture и конфигурацию, запускает два тайма через синхронный engine и печатает
события kickoff/halftime/fulltime, итог и финальное пространственное состояние. В `--format json`
в stdout выводится ровно один `MatchResult`. `replay --verify` проверяет запись, сделанную
`run --record`. `batch` запускает несколько матчей по диапазону seed с worker pool и пишет сводку.
`run --ai-coach` включает детерминированный in-match тренер (`internal/coach.Policy`, B6a):
замены (только на перерыве — единственное окно, которое ядро разрешает в Profile A/B1), тактика
и тактическая реакция на красную карточку/счёт в обоих таймах. В текстовом выводе каждое решение
печатается отдельной строкой `coach tick=... team=... <type> (accepted/rejected): <reason>`;
записанные (`--record`) команды тренера воспроизводятся `replay --verify` как обычные команды,
без повторного запуска политики. Например:

```sh
./bin/fm-cli run --input fixtures/match/equal.json --seed 42 --speed fast --format json
```

`--seed` обязателен для run/batch; `0` допустим. Для batch обязательны положительный
`--count` и `--out`; workers по умолчанию 1. `batch --mirror` (B7) дополнительно прогоняет те же
seed с поменянными местами составами и пишет `mirrored/` и `paired.json`; `summary.json` содержит
блок `distributions` (голы/удары/сейвы/xG/пасы/навесы/угловые/потери/владение/километраж).
Replay требует `--record` и `--verify`.
Все флаги идут после имени команды; позиционные аргументы не принимаются.

| Код | Значение |
|---|---|
| 0 | Успешная справка, версия, валидация или завершённый `run` |
| 1 | Ошибка выполнения (engine, запись, повтор или batch) |
| 2 | Ошибка аргументов, синтаксиса JSON, схемы или валидации данных |

Справка/версия и успешный результат валидации идут в stdout; ошибки — только в stderr.

## Fixtures и конфигурации

- `fixtures/match/equal.json`: сбалансированные симметричные команды (4-4-2, 11 стартовых + 5 запасных), `rules_profile: profile_a`.
- `fixtures/match/equal_b1.json`: то же самое, но `rules_profile: profile_b1` — единственный profile_a/profile_b1 отличается этим полем, никаких новых правил не включает сама по себе.
- `fixtures/match/favorite.json`: команда-фаворит с высоким уровнем навыков против андердога.
- `fixtures/match/tired.json`: команда с накопленной прематчевой усталостью и сниженным фитнесом.
- `fixtures/match/real/*.json`: schema v2 матчи реальных клубов (Барселона — Ман Сити, Бавария —
  Интер Майами, Реал — Ливерпуль), собранные `scripts/build_fixture.py` из `data/teams/*.json`
  (FMInside, блок `attributes.engine_v2`): лучшие по CA на слот 4-4-2, скамейка вратарь + 4
  полевых, нейтральная тактика. Пересобрать: `python3 scripts/build_fixture.py fc_barcelona manchester_city`.
- `configs/baseline.json`: каноническая базовая конфигурация профиля правил A (шаг 50 мс, тайм 45 мин).
- `configs/short_test.json`: конфигурация для быстрых тестов (тайм 60 с), правила B1 выключены.
- `configs/b1_short_test.json`: короткий профиль с включёнными офсайдом/фолами/карточками/травмами;
  требует `rules_profile: profile_b1` во входе — иначе `engine.New`/`validate` отклоняют комбинацию явной ошибкой.
- `testdata/match/` и `testdata/config/`: 14 негативных сценариев (дубликаты ID, отсутствие GK, невалидные атрибуты и т.д.).

## Проверки

```sh
make check   # gofmt check, go test ./..., go vet ./...
make smoke   # сборка и проверка настоящих exit codes/stdout/stderr
make fmt     # применить форматирование
make bench   # go test -bench для одного матча (с записью и без)
make proto   # regenerate Go/C# protobuf from api/proto
```

### C1 live smoke (не C2 API)

Для проверки минимального Go ↔ Unity обмена запустите smoke-server:

```sh
go run ./cmd/fm-api --listen 127.0.0.1:8090
```

В Unity добавьте `FM.Live.LiveSmokeClient` на любой объект открытой сцены и
запустите Editor. Компонент подключится к `ws://127.0.0.1:8090/v1/smoke` и
получит snapshots настоящего короткого матча, создаст примитивное поле,
капсулы игроков и мяч, затем применит финальный result. Для
быстрой проверки используйте `--speed fast`, для наблюдения в реальном времени
оставьте `realtime`. Это проверяет framing, generated C# и runtime
`Google.Protobuf`; команды и reconnect относятся к C2.

Во время live-просмотра кнопка `Pause` в верхней части Game view отправляет
protobuf-команду в Go. После принятия сервер возвращает `CommandOutcome` и
paused snapshot; та же кнопка становится `Resume`.

Кнопка `Resync` запрашивает актуальный snapshot в том же соединении. Сервер
отправляет его с `discontinuity=true`, поэтому Unity применяет состояние без
интерполяции. Полный reconnect и история пропущенных событий остаются
следующим срезом C2.

`make check` включает golden-тест (`internal/match/engine`), проверку зеркальных
home/away матчей и прогон batch на 1000 seed для `workers=1`/`workers=4`
(`internal/batch/balance_test.go`) — на быстром short_test-профиле, чтобы не увеличивать
время CI; B7 добавил проверку, что зеркальная серия `equal.json` совпадает с исходной посчётно
и что фаворит (`fc_bayern_vs_inter_miami`) выигрывает парную серию по очкам, а не каждый матч
(`internal/batch/b7_test.go`). Полные прогоны на боевом профиле и результаты `make bench`
задокументированы в [docs/performance-baseline.md](docs/performance-baseline.md); распределения
B7 — в [roadmap](../../docs/implementation/roadmap.md).

CI выполняет `make check` и `make smoke` на push/pull_request.
CLI-first этап завершён. B1 закрыт первым срезом: офсайд, фолы с рестартом ровно на месте
нарушения, жёлтые/красные карточки, отдельная неконтактная процедура пенальти, травмы и
прекращение матча (`status: "abandoned"`), если у команды остаётся меньше 7 активных игроков.
`rules_profile: profile_a` структурно не может включить ни одно из этих правил — `engine.New`
и `validate` отклоняют такую комбинацию конфига и входа явной ошибкой, а не молча её принимают.
Открытые упрощения: "перестройка после удаления GK" — это доказанное отсутствие
краша/нарушения инвариантов, а не переназначение роли; открытый штрафной у ворот остаётся обычным
ударом по общим правилам open-play, без модели стенки/вратаря. Оба ограничения документированы в
[roadmap](../../docs/implementation/roadmap.md) (B1) как осознанный охват, не пробел; сейв с B4/B6
зависит от реального вратаря и с B7 откалиброван по распределениям.
Общая документация в составе workspace: [roadmap](../../docs/implementation/roadmap.md).

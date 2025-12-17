# Изменения в API контракте

Документ описывает изменения, внесенные в API контракт (`docs/api-contract.yaml`).

## Обзор изменений

### 1. Обязательный параметр `context-code` для всех маршрутов
### 2. Новый маршрут для запуска шага 1 pipeline
### 3. Поле `report` в статусе шага pipeline
### 4. Маршруты для получения истории выполнения шагов

---

## 1. Обязательный параметр `context-code`

**Дата изменения:** [дата первого изменения]

**Описание:** Добавлен обязательный query-параметр `context-code` для всех API маршрутов. Этот параметр используется для изоляции данных между различными контекстами.

**Изменения:**
- Все маршруты теперь требуют параметр `context-code` в query string
- Параметр валидируется через Express middleware
- При отсутствии параметра возвращается ошибка `400 Bad Request`

**Пример использования:**
```
GET /api/items?context-code=CARL
POST /api/pipeline/step/1/run?context-code=CARL
```

**Обратная совместимость:** ❌ Требует обновления клиентов

---

## 2. Маршрут запуска шага 1 pipeline

**Дата изменения:** [дата добавления]

**Новый маршрут:** `POST /api/pipeline/step/1/run`

**Описание:** Запускает выполнение шага 1 pipeline (Polyglot Parsing) в фоновом режиме. Шаг обрабатывает SQL-файлы и схемы таблиц для указанного контекста.

**Параметры:**
- `context-code` (query, обязательный) - код контекста для изоляции данных

**Ответ:**
```json
{
  "success": true,
  "message": "Шаг 1 запущен в фоновом режиме",
  "step": {
    "id": 1,
    "name": "parsing",
    "status": "running",
    ...
  }
}
```

**Особенности:**
- Выполнение происходит асинхронно (fire-and-forget)
- Возвращает ответ сразу, не дожидаясь завершения
- Блокирует повторный запуск, если шаг уже выполняется (статус `running`)
- При попытке запуска уже выполняющегося шага возвращает `409 Conflict`

**Статусы выполнения:**
- `pending` - шаг не запущен
- `running` - шаг выполняется
- `completed` - шаг успешно завершен
- `failed` - шаг завершился с ошибкой

**Мониторинг прогресса:**
- Используйте `GET /api/pipeline/steps/status?context-code=CARL` для отслеживания прогресса
- Поле `progress` содержит процент выполнения (0-100)
- Поле `itemsProcessed` / `totalItems` показывает количество обработанных элементов

---

## 3. Поле `report` в статусе шага

**Дата изменения:** [дата добавления]

**Описание:** Добавлено опциональное поле `report` в схему `PipelineStepStatus`. Это поле содержит детальный отчет о выполнении шага в произвольном формате JSON.

**Изменения в схеме:**
```yaml
PipelineStepStatus:
  properties:
    # ... существующие поля
    report:
      type: object
      nullable: true
      description: Детальный отчет о выполнении шага в произвольном формате JSON (структура зависит от конкретного шага, доступен после завершения)
```

**Особенности:**
- Поле доступно только после завершения шага (`status: completed` или `failed`)
- Структура отчета зависит от конкретного шага
- Для шага 1 (parsing) отчет содержит:
  - `summary` - сводная статистика (количество файлов, таблиц, функций, AI Items, чанков, ошибок)
  - `details` - детальная информация по каждому обработанному файлу/таблице
- Для других шагов структура может отличаться

**Пример отчета для шага 1:**
```json
{
  "summary": {
    "totalFiles": 5,
    "totalTables": 10,
    "totalFunctions": 25,
    "totalAiItems": 35,
    "totalChunks": 50,
    "errors": 2,
    "skipped": 1
  },
  "details": {
    "sqlFiles": [...],
    "tables": [...],
    "errors": [...]
  }
}
```

**Получение отчета:**
- Отчет доступен через `GET /api/pipeline/steps/status?context-code=CARL`
- Поле `report` будет `null` до завершения шага или если шаг еще не выполнялся

---

## 4. Маршруты для получения истории выполнения шагов

**Дата изменения:** [дата добавления]

**Описание:** Добавлены маршруты для получения истории выполнения шагов pipeline. История содержит записи о каждом изменении статуса шага с временными метками.

### 4.1. История всех шагов

**Маршрут:** `GET /api/pipeline/steps/history`

**Параметры:**
- `context-code` (query, обязательный) - код контекста
- `limit` (query, опциональный) - максимальное количество записей на шаг (по умолчанию 100, максимум 1000)
- `stepId` (query, опциональный) - фильтр по ID шага (1-7). Если не указан, возвращается история всех шагов

**Ответ:**
```json
{
  "success": true,
  "steps": [
    {
      "stepId": 1,
      "stepName": "parsing",
      "history": [
        {
          "timestamp": "2024-01-01T12:00:00Z",
          "status": "pending",
          "progress": 0,
          "itemsProcessed": 0,
          "totalItems": 0
        },
        {
          "timestamp": "2024-01-01T12:01:00Z",
          "status": "running",
          "progress": 25,
          "itemsProcessed": 10,
          "totalItems": 40
        },
        {
          "timestamp": "2024-01-01T12:05:00Z",
          "status": "completed",
          "progress": 100,
          "itemsProcessed": 40,
          "totalItems": 40,
          "report": {...}
        }
      ]
    }
  ]
}
```

### 4.2. История конкретного шага

**Маршрут:** `GET /api/pipeline/step/{id}/history`

**Параметры:**
- `context-code` (query, обязательный) - код контекста
- `id` (path, обязательный) - ID шага (1-7)
- `limit` (query, опциональный) - максимальное количество записей (по умолчанию 100, максимум 1000)

**Ответ:**
```json
{
  "success": true,
  "stepId": 1,
  "stepName": "parsing",
  "history": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "status": "pending",
      ...
    }
  ]
}
```

**Схемы данных:**

**PipelineStepHistoryEntry:**
- `timestamp` (string, date-time) - время изменения состояния
- `status` (string, enum) - статус шага: `pending`, `running`, `completed`, `failed`
- `progress` (integer, 0-100, nullable) - прогресс выполнения
- `itemsProcessed` (integer, nullable) - количество обработанных элементов
- `totalItems` (integer, nullable) - общее количество элементов
- `error` (string, nullable) - сообщение об ошибке (если есть)
- `report` (object, nullable) - отчет о выполнении (если доступен)

**Особенности:**
- История отсортирована от старых записей к новым
- Записи создаются при каждом изменении статуса через `updateStep()`
- История хранится в памяти (при перезапуске сервера теряется)
- Для персистентного хранения требуется дополнительная реализация (БД)

---

## 5. Расширение количества шагов

**Дата изменения:** [дата изменения]

**Описание:** Количество шагов pipeline расширено с 5 до 7.

**Изменения:**
- ID шагов теперь могут быть: 1, 2, 3, 4, 5, 6, 7
- В схеме `PipelineStepStatus` поле `id` обновлено:
  ```yaml
  id:
    type: integer
    description: ID шага (1-7)
    enum: [1, 2, 3, 4, 5, 6, 7]
  ```

**Обратная совместимость:** ✅ Существующие шаги 1-5 остаются без изменений

---

## Миграция для клиентов

### Обязательные изменения

1. **Добавить параметр `context-code`** во все запросы к API
   ```javascript
   // Было
   fetch('/api/items')
   
   // Стало
   fetch('/api/items?context-code=CARL')
   ```

2. **Обработка ошибки 400** при отсутствии `context-code`
   ```javascript
   if (response.status === 400) {
     const error = await response.json();
     if (error.error.includes('context-code')) {
       // Добавить параметр context-code
     }
   }
   ```

### Опциональные изменения

1. **Использование нового маршрута запуска шага 1**
   ```javascript
   const response = await fetch('/api/pipeline/step/1/run?context-code=CARL', {
     method: 'POST'
   });
   const data = await response.json();
   // data.step содержит текущий статус шага
   ```

2. **Получение отчетов о выполнении**
   ```javascript
   const response = await fetch('/api/pipeline/steps/status?context-code=CARL');
   const data = await response.json();
   const step1 = data.steps.find(s => s.id === 1);
   if (step1.report) {
     console.log('Отчет:', step1.report);
   }
   ```

3. **Получение истории выполнения**
   ```javascript
   // История всех шагов
   const response = await fetch('/api/pipeline/steps/history?context-code=CARL&limit=50');
   
   // История конкретного шага
   const response = await fetch('/api/pipeline/step/1/history?context-code=CARL&limit=50');
   ```

---

## Технические детали

### Валидация context-code

Валидация выполняется через Express middleware в `routes/api.js`:
```javascript
const validateContextCode = (req, res, next) => {
  const contextCode = req.query['context-code'] || req.query.contextCode;
  if (!contextCode) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameter: context-code'
    });
  }
  req.contextCode = contextCode;
  next();
};
```

### Хранение истории

**Текущая реализация:**
- История хранится в памяти в `PipelineStateManager`
- При перезапуске сервера история теряется
- Ограничение по количеству записей: до 1000 на шаг (настраивается через `limit`)

**Рекомендации для будущей реализации:**
- Сохранение истории в БД для персистентности
- Автоматическая очистка старых записей
- Индексация по `context-code` и `timestamp` для быстрого поиска

---

## Примеры использования

### Запуск шага 1 и мониторинг прогресса

```javascript
// 1. Запуск шага
const startResponse = await fetch('/api/pipeline/step/1/run?context-code=CARL', {
  method: 'POST'
});
const startData = await startResponse.json();
console.log('Шаг запущен:', startData.step.status);

// 2. Мониторинг прогресса
const checkProgress = async () => {
  const response = await fetch('/api/pipeline/steps/status?context-code=CARL');
  const data = await response.json();
  const step1 = data.steps.find(s => s.id === 1);
  
  console.log(`Прогресс: ${step1.progress}% (${step1.itemsProcessed}/${step1.totalItems})`);
  
  if (step1.status === 'running') {
    setTimeout(checkProgress, 2000); // Проверка каждые 2 секунды
  } else if (step1.status === 'completed') {
    console.log('Отчет:', step1.report);
  }
};

checkProgress();
```

### Получение истории выполнения

```javascript
// История конкретного шага
const response = await fetch('/api/pipeline/step/1/history?context-code=CARL&limit=20');
const data = await response.json();

data.history.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.status} - ${entry.progress}%`);
});
```

---

## Версионирование

**Текущая версия API:** [версия]

**Breaking changes:**
- ✅ Добавление обязательного параметра `context-code` (требует обновления клиентов)

**Non-breaking changes:**
- ✅ Добавление новых маршрутов
- ✅ Добавление опциональных полей в существующие схемы
- ✅ Расширение enum значений (ID шагов 1-7)

---

## Связанные файлы

- `docs/api-contract.yaml` - основной контракт API
- `routes/api.js` - реализация маршрутов
- `routes/pipelineState.js` - управление состоянием pipeline
- `routes/pipeline/step1Runner.js` - логика выполнения шага 1
- `routes/loaders/sqlFunctionLoader.js` - загрузчик SQL-функций
- `routes/loaders/tableSchemaLoader.js` - загрузчик схем таблиц

---

## Вопросы и поддержка

При возникновении вопросов или проблем с API обращайтесь к разработчикам или создавайте issue в репозитории проекта.

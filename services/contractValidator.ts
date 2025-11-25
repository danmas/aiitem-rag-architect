/**
 * Клиентская валидация соответствия API контракту
 * Проверяет структуру ответов API перед использованием
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Валидирует ответ API согласно контракту
 */
export function validateApiResponse(
  method: string,
  path: string,
  statusCode: number,
  responseData: any
): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Нормализуем путь (убираем query параметры)
  const normalizedPath = path.split('?')[0];

  // 1. Проверяем структуру ошибок (4xx, 5xx)
  if (statusCode >= 400) {
    if (!responseData || typeof responseData !== 'object') {
      validation.errors.push('Error response must be an object');
      validation.valid = false;
      return validation;
    }

    if (!responseData.hasOwnProperty('success') || responseData.success !== false) {
      validation.errors.push('Error responses must have success: false');
      validation.valid = false;
    }

    if (!responseData.hasOwnProperty('error') || typeof responseData.error !== 'string') {
      validation.errors.push('Error responses must have error message string');
      validation.valid = false;
    }
  }

  // 2. Проверяем специфичные структуры для успешных ответов (2xx)
  if (statusCode >= 200 && statusCode < 300) {
    const specificValidation = validateEndpointResponse(normalizedPath, responseData, statusCode);
    validation.errors.push(...specificValidation.errors);
    validation.warnings.push(...specificValidation.warnings);
    validation.valid = validation.valid && specificValidation.valid;
  }

  return validation;
}

/**
 * Валидирует ответ конкретного endpoint
 */
function validateEndpointResponse(
  path: string,
  data: any,
  statusCode: number
): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  switch (path) {
    case '/api/files':
      return validateFilesResponse(data, statusCode);
    case '/api/stats':
      return validateStatsResponse(data, statusCode);
    case '/api/health':
      return validateHealthResponse(data, statusCode);
    case '/api/items':
      return validateItemsResponse(data, statusCode);
    case '/api/graph':
      return validateGraphResponse(data, statusCode);
    case '/api/chat':
      return validateChatResponse(data, statusCode);
    default:
      // Для неизвестных endpoints делаем базовую проверку
      return validation;
  }
}

/**
 * Валидатор для /api/files - возвращает массив FileNode
 */
function validateFilesResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Files response must be an array');
      validation.valid = false;
      return validation;
    }

    // Проверяем структуру первого элемента как пример
    if (data.length > 0) {
      const node = data[0];
      const required = ['id', 'name', 'type'];
      for (const field of required) {
        if (!node.hasOwnProperty(field)) {
          validation.errors.push(`FileNode missing required field: ${field}`);
          validation.valid = false;
        }
      }

      // Проверяем тип
      if (node.type && !['file', 'folder'].includes(node.type)) {
        validation.errors.push('FileNode type must be "file" or "folder"');
        validation.valid = false;
      }

      // Если есть children, проверяем что это массив
      if (node.hasOwnProperty('children') && !Array.isArray(node.children)) {
        validation.errors.push('FileNode children must be an array');
        validation.valid = false;
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/stats - возвращает DashboardStats
 */
function validateStatsResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Stats response must be an object');
      validation.valid = false;
      return validation;
    }

    const required = ['totalItems', 'totalDeps', 'averageDependencyDensity', 'typeStats', 'languageStats'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Stats response missing required field: ${field}`);
        validation.valid = false;
      }
    }

    // Проверяем typeStats
    if (data.typeStats !== undefined) {
      if (!Array.isArray(data.typeStats)) {
        validation.errors.push('Stats typeStats must be an array');
        validation.valid = false;
      } else if (data.typeStats.length > 0) {
        const stat = data.typeStats[0];
        if (!stat.hasOwnProperty('name') || !stat.hasOwnProperty('count')) {
          validation.errors.push('TypeStat must have name and count fields');
          validation.valid = false;
        }
      }
    }

    // Проверяем languageStats
    if (data.languageStats !== undefined) {
      if (!Array.isArray(data.languageStats)) {
        validation.errors.push('Stats languageStats must be an array');
        validation.valid = false;
      } else if (data.languageStats.length > 0) {
        const stat = data.languageStats[0];
        if (!stat.hasOwnProperty('name') || !stat.hasOwnProperty('value')) {
          validation.errors.push('LanguageStat must have name and value fields');
          validation.valid = false;
        }
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/health - возвращает HealthResponse
 */
function validateHealthResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Health response must be an object');
      validation.valid = false;
      return validation;
    }

    const required = ['status', 'timestamp', 'version', 'endpoints'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Health response missing required field: ${field}`);
        validation.valid = false;
      }
    }

    if (data.status && data.status !== 'ok') {
      validation.errors.push('Health response status must be "ok"');
      validation.valid = false;
    }

    if (data.endpoints && !Array.isArray(data.endpoints)) {
      validation.errors.push('Health response endpoints must be an array');
      validation.valid = false;
    }
  }

  return validation;
}

/**
 * Валидатор для /api/items - возвращает массив AiItem
 */
function validateItemsResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Items response must be an array');
      validation.valid = false;
      return validation;
    }

    // Проверяем структуру первого элемента как пример
    if (data.length > 0) {
      const item = data[0];
      const required = ['id', 'type', 'language', 'l0_code', 'l1_deps', 'l2_desc', 'filePath'];
      for (const field of required) {
        if (!item.hasOwnProperty(field)) {
          validation.errors.push(`AiItem missing required field: ${field}`);
          validation.valid = false;
        }
      }

      if (item.l1_deps && !Array.isArray(item.l1_deps)) {
        validation.errors.push('AiItem l1_deps must be an array');
        validation.valid = false;
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/graph - возвращает GraphData
 */
function validateGraphResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Graph response must be an object');
      validation.valid = false;
      return validation;
    }

    const required = ['nodes', 'links'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Graph response missing required field: ${field}`);
        validation.valid = false;
      }
    }

    if (data.nodes && !Array.isArray(data.nodes)) {
      validation.errors.push('Graph nodes must be an array');
      validation.valid = false;
    }

    if (data.links && !Array.isArray(data.links)) {
      validation.errors.push('Graph links must be an array');
      validation.valid = false;
    }
  }

  return validation;
}

/**
 * Валидатор для /api/chat - возвращает ChatResponse
 */
function validateChatResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Chat response must be an object');
      validation.valid = false;
      return validation;
    }

    const required = ['response', 'timestamp'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Chat response missing required field: ${field}`);
        validation.valid = false;
      }
    }

    if (data.usedContextIds && !Array.isArray(data.usedContextIds)) {
      validation.errors.push('Chat usedContextIds must be an array');
      validation.valid = false;
    }
  }

  return validation;
}



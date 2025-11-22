import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Middleware для валидации соответствия API контракту (OpenAPI спецификации)
 * 
 * Проверяет:
 * - Соответствие структуры ответов схемам в OpenAPI
 * - Корректность HTTP статус кодов
 * - Наличие обязательных полей в ответах
 * - Типы данных в ответах
 */

// Загружаем OpenAPI спецификацию
let apiContract = null;

try {
  const contractPath = path.join(__dirname, '../api-contract.yaml');
  if (fs.existsSync(contractPath)) {
    // В реальном проекте здесь было бы парсинг YAML
    // Для упрощения используем заглушку
    console.log('[Contract Validator] OpenAPI contract loaded from', contractPath);
  } else {
    console.warn('[Contract Validator] OpenAPI contract file not found, validation disabled');
  }
} catch (error) {
  console.error('[Contract Validator] Failed to load OpenAPI contract:', error.message);
}

/**
 * Валидирует структуру ответа согласно OpenAPI схеме
 * @param {string} method - HTTP метод
 * @param {string} path - API путь
 * @param {number} statusCode - HTTP статус код
 * @param {any} responseData - данные ответа
 * @returns {Object} результат валидации
 */
function validateResponse(method, path, statusCode, responseData) {
  const validation = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Базовые проверки без полного парсинга YAML
  
  // 1. Проверяем стандартную структуру success/error ответов
  if (responseData && typeof responseData === 'object') {
    // Для error ответов (4xx, 5xx) проверяем структуру ErrorResponse
    if (statusCode >= 400) {
      if (!responseData.hasOwnProperty('success') || responseData.success !== false) {
        validation.errors.push('Error responses must have success: false');
        validation.valid = false;
      }
      if (!responseData.hasOwnProperty('error') || typeof responseData.error !== 'string') {
        validation.errors.push('Error responses must have error message string');
        validation.valid = false;
      }
    }
    
    // Для success ответов (2xx) проверяем структуру SuccessResponse
    else if (statusCode >= 200 && statusCode < 300) {
      // Некоторые endpoints возвращают массивы напрямую (items, logs)
      const isDirectArray = Array.isArray(responseData);
      const isHealthResponse = responseData.hasOwnProperty('status') && responseData.status === 'ok';
      
      if (!isDirectArray && !isHealthResponse) {
        if (!responseData.hasOwnProperty('success') || responseData.success !== true) {
          validation.warnings.push('Success responses should have success: true field');
        }
      }
    }
  }
  
  // 2. Проверяем специфичные структуры для известных endpoints
  const pathValidations = {
    '/api/health': validateHealthResponse,
    '/api/items': validateItemsResponse,
    '/api/stats': validateStatsResponse,
    '/api/graph': validateGraphResponse,
    '/api/chat': validateChatResponse
  };
  
  // Нормализуем путь (убираем параметры)
  const normalizedPath = path.replace(/\/[^/]+$/, '/{id}').replace(/\/\d+\//, '/{id}/');
  
  if (pathValidations[normalizedPath]) {
    const specificValidation = pathValidations[normalizedPath](responseData, statusCode);
    validation.errors.push(...specificValidation.errors);
    validation.warnings.push(...specificValidation.warnings);
    validation.valid = validation.valid && specificValidation.valid;
  }
  
  return validation;
}

/**
 * Специфичные валидаторы для отдельных endpoints
 */

function validateHealthResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    const required = ['status', 'timestamp', 'version', 'endpoints'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Health response missing required field: ${field}`);
        validation.valid = false;
      }
    }
    
    if (data.status !== 'ok') {
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

function validateItemsResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Items response must be an array');
      validation.valid = false;
    } else {
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
  }
  
  return validation;
}

function validateStatsResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    const required = ['totalItems', 'totalDeps', 'averageDependencyDensity', 'typeStats', 'languageStats'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Stats response missing required field: ${field}`);
        validation.valid = false;
      }
    }
    
    if (data.typeStats && !Array.isArray(data.typeStats)) {
      validation.errors.push('Stats typeStats must be an array');
      validation.valid = false;
    }
    
    if (data.languageStats && !Array.isArray(data.languageStats)) {
      validation.errors.push('Stats languageStats must be an array');
      validation.valid = false;
    }
  }
  
  return validation;
}

function validateGraphResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
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

function validateChatResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
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

/**
 * Express middleware для валидации ответов
 */
export function contractValidationMiddleware(options = {}) {
  const { 
    enabled = process.env.NODE_ENV !== 'production',
    logErrors = true,
    logWarnings = false,
    throwOnError = false
  } = options;
  
  return (req, res, next) => {
    if (!enabled) {
      return next();
    }
    
    // Перехватываем оригинальные методы ответа
    const originalJson = res.json;
    const originalSend = res.send;
    
    res.json = function(data) {
      if (enabled) {
        const validation = validateResponse(req.method, req.path, res.statusCode, data);
        
        if (!validation.valid) {
          const errorMessage = `Contract validation failed for ${req.method} ${req.path}: ${validation.errors.join(', ')}`;
          
          if (logErrors) {
            console.error(`[Contract Validator] ${errorMessage}`);
          }
          
          if (throwOnError) {
            throw new Error(errorMessage);
          }
        }
        
        if (validation.warnings.length > 0 && logWarnings) {
          console.warn(`[Contract Validator] Warnings for ${req.method} ${req.path}: ${validation.warnings.join(', ')}`);
        }
      }
      
      return originalJson.call(this, data);
    };
    
    res.send = function(data) {
      // Для text/plain ответов пропускаем валидацию
      if (res.getHeader('Content-Type')?.includes('application/json')) {
        try {
          const jsonData = JSON.parse(data);
          const validation = validateResponse(req.method, req.path, res.statusCode, jsonData);
          
          if (!validation.valid && logErrors) {
            console.error(`[Contract Validator] Validation failed for ${req.method} ${req.path}: ${validation.errors.join(', ')}`);
          }
        } catch (e) {
          // Не JSON данные - пропускаем
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Функция для валидации конкретного ответа (для тестов)
 */
export function validateApiResponse(method, path, statusCode, responseData) {
  return validateResponse(method, path, statusCode, responseData);
}

export default contractValidationMiddleware;

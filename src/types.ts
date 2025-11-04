export interface RouteInfo {
  method: string;
  path: string;
  handlerName: string;
  controllerMethod: string;
  hasAuth: boolean;
  middleware: string[];
  validatorSchema?: string; // e.g., "authSchemas.register"
}

export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
}

export interface ControllerInfo {
  requestBodyType?: string;
  requestBodyFields?: FieldInfo[];
  responseType?: string;
  statusCodes: number[];
}

export interface SmartField {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface SimpleEndpointConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  summary: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  requestBody?: {
    required: boolean;
    content: {
      'application/json': {
        schema: any;
      };
    };
  };
  responses: {
    [statusCode: string]: {
      description: string;
      content?: {
        'application/json': {
          schema: any;
        };
      };
    };
  };
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'header';
    required: boolean;
    schema: any;
    description?: string;
  }>;
  noAuth?: boolean;
}

export interface SwaggerifyOptions {
  routesDir?: string;
  controllersDir?: string;
  validatorsDir?: string; // Directory where Joi validators are located
  schemasDir?: string; // Directory where TypeScript type definitions are located
  outputFile?: string;
  basePath?: string;
  title?: string;
  version?: string;
  description?: string;
  servers?: Array<{
    url: string;
    description: string;
  }>;
  customSchemas?: Record<string, any>;
  smartDefaults?: boolean;
  fieldTypeInference?: boolean;
}

declare module "@plantuml/core/viz-global.js";
declare module "swagger-ui-dist/swagger-ui-bundle.js" {
  interface SwaggerUiOptions {
    domNode: HTMLElement;
    spec: Record<string, unknown>;
    supportedSubmitMethods: string[];
    validatorUrl: null;
    tryItOutEnabled: boolean;
    persistAuthorization: boolean;
    docExpansion?: string;
    defaultModelExpandDepth?: number;
    defaultModelsExpandDepth?: number;
    requestInterceptor?: (request: unknown) => unknown;
  }
  interface SwaggerUiBundle {
    (options: SwaggerUiOptions): unknown;
  }
  const bundle: SwaggerUiBundle;
  export default bundle;
}
declare module "swagger-ui-dist/swagger-ui.css";

declare module "@plantuml/core/plantuml.js" {
  export function render(lines: string[], targetId: string, options?: { dark?: boolean }): void;
  export function renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: unknown) => void
  ): void;
}

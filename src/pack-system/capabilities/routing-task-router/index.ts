// `routing.task-router/v1` capability barrel (WU7).

export { ROUTING_TASK_ROUTER_V1 } from "./types.js";
export type { RoutingTask, TaskRouterV1 } from "./types.js";
export {
  referenceTaskRouterV1,
  runTaskRouterV1Conformance,
  taskRouterV1ConformanceChecks,
} from "./conformance/suite.js";

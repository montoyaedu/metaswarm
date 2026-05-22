// Capabilities-local barrel (WU7).
//
// Ergonomic import point for the three v0 capability contracts and their
// conformance suites. Distinct from the manifest-surface freeze barrel —
// capability interfaces are contracts, but the conformance machinery is
// pack-system internal.

export {
  type ConformanceCheck,
  type ConformanceCheckOutcome,
  type ConformanceReport,
  ensure,
  expectRejection,
  isPlainJsonObject,
  runConformanceSuite,
} from "./conformance.js";
export { capabilityInvokedEvent, observabilityCheck } from "./observability.js";

export {
  ROUTING_TASK_ROUTER_V1,
  type TaskRouterV1,
  referenceTaskRouterV1,
  runTaskRouterV1Conformance,
  taskRouterV1ConformanceChecks,
} from "./routing-task-router/index.js";

export {
  INTEGRATIONS_PROVIDER_V1,
  type DeclaredAction,
  type IntegrationsConformanceFixture,
  type IntegrationsProviderSubject,
  type IntegrationsProviderV1,
  integrationsProviderV1ConformanceChecks,
  referenceIntegrationsFixture,
  referenceIntegrationsProviderV1,
  runIntegrationsProviderV1Conformance,
} from "./integrations-provider/index.js";

export {
  CREDENTIALS_RESOLVER_V1,
  type CredentialsConformanceFixture,
  type CredentialsResolverSubject,
  type CredentialsResolverV1,
  type SecretRef,
  credentialsResolverV1ConformanceChecks,
  isSecretRef,
  referenceCredentialsFixture,
  referenceCredentialsResolverV1,
  runCredentialsResolverV1Conformance,
} from "./credentials-resolver/index.js";

// `integrations.provider/v1` capability barrel (WU7).

export { INTEGRATIONS_PROVIDER_V1 } from "./types.js";
export type {
  DeclaredAction,
  IntegrationsConformanceFixture,
  IntegrationsProviderSubject,
  IntegrationsProviderV1,
  JsonObject,
} from "./types.js";
export {
  integrationsProviderV1ConformanceChecks,
  referenceIntegrationsFixture,
  referenceIntegrationsProviderV1,
  runIntegrationsProviderV1Conformance,
} from "./conformance/suite.js";

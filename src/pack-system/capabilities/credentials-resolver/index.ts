// `credentials.resolver/v1` capability barrel (WU7).

export { CREDENTIALS_RESOLVER_V1, isSecretRef } from "./types.js";
export type {
  CredentialsConformanceFixture,
  CredentialsResolverSubject,
  CredentialsResolverV1,
  SecretRef,
} from "./types.js";
export {
  credentialsResolverV1ConformanceChecks,
  referenceCredentialsFixture,
  referenceCredentialsResolverV1,
  runCredentialsResolverV1Conformance,
} from "./conformance/suite.js";

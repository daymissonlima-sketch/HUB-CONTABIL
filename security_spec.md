# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Verified Authentication & Admin/Office Membership**: Only authenticated users with `email_verified == true` who are either the bootstrapped administrator (`daymisson.lima@hotmail.com`) or explicitly registered in `/admins/{uid}` may read or write office fiscal records.
2. **Organization Scope Invariant**: Every company (`CompanyRecord`), fiscal document (`SefazDocumentRecord`), and pending key list (`PendingKeysRecord`) must strictly carry `orgId == 'moreira_lima'`, and `allow list` rules must enforce `resource.data.orgId == 'moreira_lima'` alongside `isAdmin()`.
3. **Identity & Audit Invariant**: Every create and update on `/companies/{companyId}`, `/sefaz_documents/{docId}`, and `/sefaz_pending_keys/{cnpjId}` must set `updatedByUid == request.auth.uid` so no user can spoof another user's identity in the audit trail.
4. **Immutability Invariant**: Core identity keys (`orgId`, `cnpj`, `chave`, `empresaCnpj`) cannot be mutated during `update` operations (`incoming().cnpj == existing().cnpj`, `incoming().chave == existing().chave`).
5. **Volumetric & Type Safety Invariant**: All string fields must validate `is string` and enforce strict `.size()` boundaries matching `firebase-blueprint.json`; all map/list fields must enforce `.size()` limits; document IDs must pass `isValidId()`.

---

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Spoof Attack**:
   - Auth token has `email: "daymisson.lima@hotmail.com"`, `email_verified: false`.
   - Payload: `GET /companies/08470032000162` -> Must return `PERMISSION_DENIED`.
2. **Shadow Field Injection on Company Create**:
   - Payload includes required keys plus `"isSuperAdmin": true`.
   - Target: `CREATE /companies/08470032000162` -> Rejected by `.keys().hasOnly(...)`.
3. **Identity Spoofing (`updatedByUid` Mismatch)**:
   - Authenticated as `uid: "user_1"`, sends `"updatedByUid": "user_2"`.
   - Target: `CREATE /companies/08470032000162` -> Rejected by `data.updatedByUid == request.auth.uid`.
4. **Cross-Organization Injection (`orgId` Tampering)**:
   - Payload sets `"orgId": "rogue_org"`.
   - Target: `CREATE /sefaz_documents/08470032000162_23261008470032000162550010000012341000012345` -> Rejected by `data.orgId == 'moreira_lima'`.
5. **Immutable Field Mutation (`chave` Change on Update)**:
   - Attempts to change `chave` on an existing `/sefaz_documents/{docId}` record.
   - Target: `UPDATE /sefaz_documents/doc_1` -> Rejected by `incoming().chave == existing().chave` and `affectedKeys().hasOnly(...)`.
6. **Malformed NF-e Access Key (Regex Bypass)**:
   - Sends `chave` with 43 digits or non-numeric characters (`"2326100847003200016255001000001234100001234A"`).
   - Target: `CREATE /sefaz_documents/doc_1` -> Rejected by `data.chave.matches('^[0-9]{44}$')`.
7. **Denial of Wallet / Oversized XML Payload**:
   - Sends `xmlContent` exceeding `850000` characters.
   - Target: `CREATE /sefaz_documents/doc_1` -> Rejected by `data.xmlContent.size() <= 850000`.
8. **ID Poisoning Attack (Path Variable Overflow)**:
   - Attempts to create a document with a 300-character ID or invalid special characters.
   - Target: `CREATE /companies/invalid$id!@#` -> Rejected by `isValidId(companyId)`.
9. **Unauthorized Update of Shadow Key on Update ("Update-Gap")**:
   - Sends an update modifying an undeclared field `"hacked": "yes"`.
   - Target: `UPDATE /companies/08470032000162` -> Rejected by `isValidCompanyRecord(incoming())` and `affectedKeys().hasOnly(...)`.
10. **Value Poisoning on Update (Invalid Enum `situacao`)**:
    - Updates `situacao` on `/sefaz_documents/{docId}` to `"INVALID_STATUS"`.
    - Target: `UPDATE /sefaz_documents/doc_1` -> Rejected by `isValidSefazDocumentRecord(incoming())`.
11. **Unbounded Array Poisoning on Pending Keys**:
    - Sends `pendingKeys` array with non-string first element or > 500 elements.
    - Target: `CREATE /sefaz_pending_keys/08470032000162` -> Rejected by `isValidPendingKeysRecord(incoming())`.
12. **Self-Privilege Escalation in `/admins/{adminUid}`**:
    - Non-admin authenticated user attempts to create `/admins/their_own_uid`.
    - Target: `CREATE /admins/attacker_uid` -> Rejected by `isAdmin()`.

---

## 3. The Test Runner (`firestore.rules.test.ts` Specification)

```typescript
// Specification for verifying all 12 Dirty Dozen payloads return PERMISSION_DENIED
export const DIRTY_DOZEN_ASSERTIONS = [
  { id: 1, name: 'Unverified Email Spoof Attack', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Shadow Field Injection on Company Create', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Identity Spoofing (updatedByUid Mismatch)', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Cross-Organization Injection (orgId Tampering)', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Immutable Field Mutation (chave Change on Update)', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Malformed NF-e Access Key (Regex Bypass)', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Oversized XML Payload (>850KB)', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'ID Poisoning Attack', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Update-Gap Shadow Key Injection', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Value Poisoning on Update (Invalid Enum situacao)', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Unbounded Array Poisoning on Pending Keys', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Self-Privilege Escalation in /admins', expected: 'PERMISSION_DENIED' },
];
```

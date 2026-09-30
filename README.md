# Contact Management System — React + Firebase

React + TypeScript contact management application using Firebase.

**Persistence:** all application data is stored in Firebase. Do not use local JSON files or browser storage as an application database.

---

# 1. Requirements

## Authentication

- Register with email/password.
- Login and logout.
- Email verification.
- Password reset.
- Restore auth state after browser refresh.

## Contacts

- List contacts.
- View contact details.
- Create contact.
- Edit contact.
- Delete contact.
- Search by name, email, or phone.
- Real-time contact updates.

## Account

- Display email from Firebase Auth.
- Edit display name in Firestore.
- Upload and delete avatar in Firebase Storage.

---

# 2. Architecture

```text
React + TypeScript
        │
        ├── Firebase Authentication
        │       └── identity / session
        │
        ├── Cloud Firestore
        │       ├── user profile
        │       └── contacts
        │
        └── Cloud Storage
                └── avatar
```

| Concern | Source of truth |
| --- | --- |
| Authentication identity | Firebase Authentication |
| User profile | Firestore |
| Contacts | Firestore |
| Avatar file | Cloud Storage |
| Navigation | URL / React Router |
| Temporary UI state | React state |

React state may temporarily contain Firebase data for rendering, but it is not persistent storage.

---

# 3. Firestore Data Model

```text
users/{uid}
    │
    └── contacts/{contactId}
```

## 3.1 User document

Path:

```text
users/{uid}
```

Fields:

```text
displayName : string
avatarPath  : string | null
createdAt   : Timestamp
updatedAt   : Timestamp
```

`uid`, `email`, and `emailVerified` come from Firebase Authentication.

## 3.2 Contact document

Path:

```text
users/{uid}/contacts/{contactId}
```

Fields:

```text
name      : string
email     : string | null
phone     : string
company   : string | null
notes     : string | null
createdAt : Timestamp
updatedAt : Timestamp
```

`contactId` is the Firestore document ID. Do not store another `id` field.

## 3.3 TypeScript types

```ts
import type { Timestamp } from 'firebase/firestore';

export type ContactInput = {
  name: string;
  email?: string;
  phone: string;
  company?: string;
  notes?: string;
};

export type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  company: string | null;
  notes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type UserProfile = {
  displayName: string;
  avatarPath: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

---

# 4. Data Ownership

The authenticated Firebase UID is the ownership boundary.

```text
Firebase Auth
    │
    └── uid = ABC
          │
          └── users/ABC/contacts/*
```

Every Firestore reference must be created from the authenticated Firebase user. Never use a client-supplied UID as the ownership source.

---

# 5. Routes

```text
/login
/register
/forgot-password
/reset-password
/verify-email

/app/dashboard
/app/contacts
/app/contacts/new
/app/contacts/:contactId
/app/contacts/:contactId/edit
/app/account
```

## Route guards

```text
PublicOnlyRoute
    └── /login /register /forgot-password /reset-password

ProtectedRoute
    └── /verify-email

EmailVerifiedRoute
    └── /app/*
```

Route guards control UI navigation. Firebase Security Rules control data access.

---

# 6. Authentication

Firebase Authentication is the source of truth for authentication state.

## Auth state

```ts
onAuthStateChanged(auth, (user) => {
  setUser(user);
  setLoading(false);
});
```

Auth context:

```ts
export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
};
```

Do not create a separate persistent `isLoggedIn` flag.

## Registration

```text
Register
  ↓
createUserWithEmailAndPassword()
  ↓
create users/{uid}
  ↓
sendEmailVerification()
  ↓
/verify-email
```

If profile creation fails after Auth creation, show an error and allow retry.

## Login

```text
Login
  ↓
signInWithEmailAndPassword()
  ↓
verified?
 ├── No  → /verify-email
 └── Yes → /app/dashboard
```

After email verification, reload the Firebase user before checking `emailVerified` again.

---

# 7. Contact Service

All contact Firestore operations belong in `contactService.ts`.

The service must not update React state directly. It should return data or an unsubscribe function; hooks/components own React state.

The service must get the UID from the authenticated Firebase user, not from a client-supplied value.

## Create

```ts
export async function createContact(input: ContactInput) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Unauthenticated');

  const ref = collection(db, 'users', uid, 'contacts');

  return addDoc(ref, {
    name: input.name,
    email: input.email?.trim() || null,
    phone: input.phone.trim(),
    company: input.company?.trim() || null,
    notes: input.notes?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
```

## List

Use `onSnapshot()` for the contact list.

```ts
export function subscribeToContacts(
  uid: string,
  onChange: (contacts: Contact[]) => void,
  onError: (error: Error) => void,
) {
  const ref = collection(db, 'users', uid, 'contacts');

  return onSnapshot(ref, (snapshot) => {
    onChange(
      snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Contact[],
    );
  }, onError);
}
```

The hook/component calls the returned unsubscribe function during cleanup.

## Detail

Build the document reference only with:

```text
users/{authenticatedUid}/contacts/{contactId}
```

## Update

Update editable contact fields and `updatedAt`. Never update `createdAt` or the document ID.

## Delete

Use `deleteDoc()` on the authenticated user's contact document.

---

# 8. Search

Search is client-side for the small learning dataset.

```ts
const q = search.trim().toLowerCase();

const visibleContacts = contacts.filter((contact) =>
  contact.name.toLowerCase().includes(q) ||
  (contact.email ?? '').toLowerCase().includes(q) ||
  contact.phone.toLowerCase().includes(q),
);
```

The filtered result is temporary in-memory UI state and is never persisted locally.

---

# 9. State Management

```text
Firebase Auth / Firestore
          ↓
        hooks
          ↓
    React state/context
          ↓
          UI
```

Use React state for:

- form values;
- search input;
- dialogs/modals;
- loading and error state;
- the current Firestore subscription result.

Do not persist this state to browser storage.

Recommended contact state:

```ts
export type ContactState = {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
};
```

---

# 10. Security Rules

The basic ownership condition is:

```text
request.auth != null
&& request.auth.uid == userId
```

Required behavior:

| Request | Result |
| --- | --- |
| Anonymous → private data | DENY |
| User A → User A data | ALLOW |
| User A → User B data | DENY |

## Firestore rules

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(userId) {
      return request.auth != null
          && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read, create: if isOwner(userId);
      allow update: if isOwner(userId)
        && request.resource.data.createdAt == resource.data.createdAt;

      match /contacts/{contactId} {
        allow read, delete: if isOwner(userId);
        allow create: if isOwner(userId);
        allow update: if isOwner(userId)
          && request.resource.data.createdAt == resource.data.createdAt;
      }
    }
  }
}
```

Field/type validation can be added after the ownership rules pass their tests.

---

# 11. Storage

Avatar path:

```text
users/{uid}/avatar/profile
```

The path intentionally has no file extension because the application accepts multiple image formats.

Recommended constraints:

```text
JPEG / PNG / WebP
Maximum 2 MiB
```

Only the authenticated owner may read, write, or delete the avatar. Enforce ownership and file constraints in Storage Rules, not only in React.

---

## Storage Rules

```text
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/avatar/{fileName} {
      allow read, delete: if request.auth != null
        && request.auth.uid == userId;
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size <= 2 * 1024 * 1024
        && request.resource.contentType in ['image/jpeg', 'image/png', 'image/webp'];
    }
  }
}
```

# 12. Firebase Emulator

Use the Firebase Local Emulator Suite for local development and testing.

```text
Auth Emulator
Firestore Emulator
Storage Emulator
```

Start:

```bash
firebase emulators:start --only auth,firestore,storage
```

The React app should connect to these emulators in development.

---

# 13. Project Structure

```text
src/
├── app/
│   ├── App.tsx
│   └── router.tsx
│
├── components/
│   ├── auth/
│   ├── contacts/
│   ├── account/
│   └── layout/
│
├── contexts/
│   └── AuthContext.tsx
│
├── firebase/
│   ├── config.ts
│   ├── auth.ts
│   ├── firestore.ts
│   └── storage.ts
│
├── hooks/
│   ├── useAuth.ts
│   └── useContacts.ts
│
├── services/
│   ├── authService.ts
│   ├── userService.ts
│   ├── contactService.ts
│   └── storageService.ts
│
├── pages/
│   ├── auth/
│   ├── dashboard/
│   ├── contacts/
│   └── account/
│
├── types/
│   ├── auth.ts
│   ├── contact.ts
│   └── user.ts
│
└── main.tsx

firestore.rules
storage.rules
firebase.json
.firebaserc
.env.local
package.json
```

---

# 14. Testing

## Unit — Vitest

- Contact validation.
- Search filtering.
- Firebase error mapping.

## Component — React Testing Library

- Login/register.
- Route guards.
- Contact form/list.
- Account page.

## E2E — Playwright

```text
Register
  ↓
Verify email
  ↓
Login
  ↓
Create contact
  ↓
View contact
  ↓
Edit contact
  ↓
Delete contact
  ↓
Logout
```

## Security

Test anonymous access, own-user access, and cross-user access with the Firebase Emulator Suite.

## Persistence

```text
Create contact
  ↓
Refresh browser
  ↓
Contact is loaded from Firestore
```

The test must pass without local JSON or browser-storage persistence.

---

# 15. Implementation Order

### Phase 1 — Foundation

- React + TypeScript.
- React Router.
- Firebase SDK.
- Emulator configuration.

### Phase 2 — Authentication

- Firebase Auth initialization.
- AuthContext.
- Register/login/logout.
- Email verification.
- Password reset.
- Route guards.

### Phase 3 — Contacts

- Firestore schema.
- Contact service.
- Create/list/detail/edit/delete.
- Real-time listener.
- Search.

### Phase 4 — Account

- User profile.
- Avatar upload/delete.

### Phase 5 — Security and Testing

- Firestore Rules.
- Storage Rules.
- Unit/component/E2E tests.
- Persistence test.

---

# 16. Acceptance Criteria

## Authentication

- [ ] Register works.
- [ ] Login/logout works.
- [ ] Auth state survives refresh.
- [ ] Email verification works.
- [ ] Unverified users cannot access `/app/*`.
- [ ] Password reset works.

## Contacts

- [ ] Contacts are stored in `users/{uid}/contacts/{contactId}`.
- [ ] Contact CRUD works.
- [ ] Real-time updates work.
- [ ] Search works.
- [ ] Contact remains after browser refresh.

## Security

- [ ] Anonymous access is denied.
- [ ] Cross-user access is denied.
- [ ] Ownership uses Firebase Auth UID.
- [ ] `createdAt` cannot be changed after creation.

## Account

- [ ] User profile is stored in `users/{uid}`.
- [ ] Display name can be updated.
- [ ] Avatar upload/delete works.
- [ ] Avatar access is owner-only.

## Persistence

- [ ] No application data is stored in local JSON files.
- [ ] No application data is stored in `localStorage`.
- [ ] No application data is stored in `sessionStorage`.
- [ ] No application data is stored in IndexedDB.

---

# 17. Implementation Rules

1. Firebase is the persistence layer.
2. Firestore is the source of truth for structured application data.
3. Firebase Auth is the source of truth for authentication identity.
4. Cloud Storage is used for avatar files only.
5. React state is temporary UI state, not persistent storage.
6. Ownership always comes from the authenticated Firebase UID.
7. Firebase operations stay inside service modules.
8. Security Rules enforce data access.
9. Do not create local JSON or browser-storage persistence.
10. Keep the implementation focused on the requirements in this document.

---

# 18. TODO

## Project Setup

- [ ] Create React + TypeScript project.
- [ ] Install Firebase and React Router.
- [ ] Configure Firebase project.
- [ ] Configure Firebase Emulator Suite.
- [ ] Add environment variables.

## Authentication

- [ ] Initialize Firebase Auth.
- [ ] Create `AuthContext`.
- [ ] Implement register.
- [ ] Create `users/{uid}` profile after registration.
- [ ] Implement login.
- [ ] Implement logout.
- [ ] Implement email verification.
- [ ] Implement password reset.
- [ ] Implement route guards.

## Contact Management

- [ ] Create `Contact` and `ContactInput` types.
- [ ] Implement `contactService.ts`.
- [ ] Implement create contact.
- [ ] Implement real-time contact list with `onSnapshot`.
- [ ] Implement contact details.
- [ ] Implement edit contact.
- [ ] Implement delete contact.
- [ ] Implement client-side search.

## Account

- [ ] Implement user profile loading/updating.
- [ ] Implement avatar upload.
- [ ] Implement avatar deletion.
- [ ] Implement password change.
- [ ] Implement account deletion.

## Security

- [ ] Write Firestore Security Rules.
- [ ] Write Storage Security Rules.
- [ ] Validate contact fields in Rules.
- [ ] Verify cross-user access is denied.
- [ ] Verify anonymous access is denied.

## Testing

- [ ] Add Vitest tests.
- [ ] Add React Testing Library tests.
- [ ] Add Playwright E2E test.
- [ ] Add Firestore Rules tests.
- [ ] Add Storage Rules tests.
- [ ] Test browser refresh loads contacts from Firestore.
- [ ] Verify no local JSON persistence exists.
- [ ] Verify no browser-storage persistence exists.

## Final Review

- [ ] Verify the Firestore schema matches this document.
- [ ] Verify all Firebase operations are inside service modules.
- [ ] Verify ownership always uses the authenticated Firebase UID.
- [ ] Verify all acceptance criteria are satisfied.
- [ ] Remove unused code and dependencies.
- [ ] Run the full test suite.

import { doc } from 'firebase/firestore';

const authorizationFailure = () => Object.assign(new Error('REVIEWER_NOT_AUTHORIZED'), { code: 'REVIEWER_NOT_AUTHORIZED' });

export const reviewerMemberRef = (db, familyId, uid) => doc(db, 'families', familyId, 'members', uid);

export const normalizeReviewerMember = (member = {}) => {
  const source = member || {};
  return {
    role: ['parent', 'admin', 'student'].includes(source.role) ? source.role : 'student',
    active: source.active === true,
  };
};

export const isAuthorizedRewardReviewer = (member = {}) => {
  const normalized = normalizeReviewerMember(member);
  return normalized.active && ['parent', 'admin'].includes(normalized.role);
};

// This repository-level check is an application invariant. Firestore Security Rules remain
// the final authorization boundary and must enforce the same family membership requirement.
export const assertAuthorizedRewardReviewer = (member = {}) => {
  if (!isAuthorizedRewardReviewer(member)) throw authorizationFailure();
};

export const assertReviewerUid = (reviewerUid) => {
  if (typeof reviewerUid !== 'string' || !reviewerUid.trim()) throw authorizationFailure();
  return reviewerUid;
};

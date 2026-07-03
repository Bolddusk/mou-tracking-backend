const { assertCanViewPartyAProfile, assertCanViewPartyAProfileOnProposal } = require('./partyAProfileAccess');
const { assertCanViewPartyBProfile, assertCanViewPartyBProfileOnProposal } = require('./partyBProfileAccess');
const { buildProfileResponse: buildPartyAProfileResponse } = require('../controllers/partyAProfileController');
const { buildProfileResponse: buildPartyBProfileResponse } = require('../controllers/partyBProfileController');

async function loadPartyAProfileSnapshot(viewer, partyAUserId, proposal = null) {
  if (!partyAUserId) {
    return { linked: false, data: null, reason: 'no_party_a_user' };
  }

  const access = proposal
    ? await assertCanViewPartyAProfileOnProposal(viewer, partyAUserId, proposal)
    : await assertCanViewPartyAProfile(viewer, partyAUserId);

  if (!access.ok) {
    return { linked: true, data: null, reason: access.error, status: access.status };
  }

  try {
    const data = await buildPartyAProfileResponse(access.user.id, {
      user: access.user,
      read_only: access.read_only,
      can_edit: access.can_edit,
    });
    return { linked: true, data };
  } catch {
    return { linked: true, data: null, reason: 'load_failed' };
  }
}

async function loadPartyBProfileSnapshot(viewer, partyBUserId, proposal = null) {
  if (!partyBUserId) {
    return { linked: false, data: null, reason: 'no_party_b_user' };
  }

  const access = proposal
    ? await assertCanViewPartyBProfileOnProposal(viewer, partyBUserId, proposal)
    : await assertCanViewPartyBProfile(viewer, partyBUserId);

  if (!access.ok) {
    return {
      linked: access.linked === false ? false : true,
      data: null,
      reason: access.error,
      status: access.status,
    };
  }

  try {
    const data = await buildPartyBProfileResponse(access.user.id, {
      user: access.user,
      read_only: access.read_only,
      can_edit: access.can_edit,
    });
    return { linked: true, data };
  } catch {
    return { linked: true, data: null, reason: 'load_failed' };
  }
}

module.exports = {
  loadPartyAProfileSnapshot,
  loadPartyBProfileSnapshot,
};

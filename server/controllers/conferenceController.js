const {
  listActiveConferences,
  listAllConferencesAdmin,
  getConferenceRowById,
  getConferenceUsage,
  createConference,
  updateConference,
  deleteConference,
  formatConferenceRow,
  CONFERENCE_ENGAGEMENT_TYPES,
} = require('../utils/conferenceRegistry');

async function getActiveConferences(req, res) {
  try {
    let conferences = await listActiveConferences();
    const { isGlobalRole, getMinistryFilter } = require('../utils/ministryScope');
    const ministryId = getMinistryFilter(req.user, req.query.ministry_id);
    if (ministryId) {
      conferences = conferences.filter((c) => Number(c.ministry_id) === Number(ministryId));
    } else if (!isGlobalRole(req.user) && req.user.ministry_id) {
      conferences = conferences.filter(
        (c) => Number(c.ministry_id) === Number(req.user.ministry_id)
      );
    }
    return res.json({
      conferences,
      items: conferences,
      engagement_types: CONFERENCE_ENGAGEMENT_TYPES,
      count: conferences.length,
    });
  } catch (err) {
    console.error('List active conferences error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch conferences' });
  }
}

async function adminListConferences(req, res) {
  try {
    const conferences = await listAllConferencesAdmin();
    return res.json({
      conferences,
      engagement_types: CONFERENCE_ENGAGEMENT_TYPES,
      count: conferences.length,
    });
  } catch (err) {
    console.error('Admin list conferences error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch conferences' });
  }
}

async function adminGetConference(req, res) {
  try {
    const row = await getConferenceRowById(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Conference not found' });
    }
    const usage = await getConferenceUsage(row.conference_key);
    return res.json({ conference: formatConferenceRow(row, usage) });
  } catch (err) {
    console.error('Admin get conference error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch conference' });
  }
}

async function adminCreateConference(req, res) {
  try {
    const result = await createConference(req.body);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(201).json({
      message: 'Conference created',
      conference: result.conference,
    });
  } catch (err) {
    console.error('Create conference error:', err.message);
    return res.status(500).json({ error: 'Failed to create conference' });
  }
}

async function adminUpdateConference(req, res) {
  try {
    const result = await updateConference(req.params.id, req.body);
    if (result.error) {
      const payload = { error: result.error };
      if (result.usage) payload.usage = result.usage;
      return res.status(result.status).json(payload);
    }
    return res.json({
      message: 'Conference updated',
      conference: result.conference,
    });
  } catch (err) {
    console.error('Update conference error:', err.message);
    return res.status(500).json({ error: 'Failed to update conference' });
  }
}

async function adminDeleteConference(req, res) {
  try {
    const result = await deleteConference(req.params.id);
    if (result.error) {
      const payload = { error: result.error };
      if (result.usage) payload.usage = result.usage;
      return res.status(result.status).json(payload);
    }
    return res.json(result);
  } catch (err) {
    console.error('Delete conference error:', err.message);
    return res.status(500).json({ error: 'Failed to delete conference' });
  }
}

module.exports = {
  getActiveConferences,
  adminListConferences,
  adminGetConference,
  adminCreateConference,
  adminUpdateConference,
  adminDeleteConference,
};

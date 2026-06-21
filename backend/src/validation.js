/**
 * Validates and coerces user preference fields.
 * Accepted keys: theme, canvas_zoom, canvas_pan, sidebar_width.
 * Unknown keys are ignored — stored preferences are merged server-side.
 */
export function validatePreferences(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (Object.keys(body).length === 0) {
    return { error: 'At least one preference field is required (theme, canvas_zoom, canvas_pan, sidebar_width)' };
  }

  if ('theme' in body) {
    if (!['light', 'dark', 'system'].includes(body.theme)) {
      return { error: "theme must be one of: 'light', 'dark', 'system'" };
    }
  }

  if ('canvas_zoom' in body) {
    const zoom = Number(body.canvas_zoom);
    if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 5) {
      return { error: 'canvas_zoom must be a number between 0.1 and 5' };
    }
  }

  if ('canvas_pan' in body) {
    const pan = body.canvas_pan;
    if (
      !pan ||
      typeof pan !== 'object' ||
      Array.isArray(pan) ||
      typeof pan.x !== 'number' ||
      typeof pan.y !== 'number'
    ) {
      return { error: 'canvas_pan must be an object with numeric x and y fields' };
    }
  }

  if ('sidebar_width' in body) {
    const width = Number(body.sidebar_width);
    if (!Number.isFinite(width) || width < 0 || width > 2000) {
      return { error: 'sidebar_width must be a number between 0 and 2000' };
    }
  }

  return { data: body };
}

/**
 * Validates workspace state fields.
 * Accepted keys: selected_agent, agent_positions, active_tab.
 */
export function validateWorkspaceData(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (Object.keys(body).length === 0) {
    return { error: 'At least one workspace field is required (selected_agent, agent_positions, active_tab)' };
  }

  if ('selected_agent' in body && body.selected_agent !== null && typeof body.selected_agent !== 'string') {
    return { error: 'selected_agent must be a string or null' };
  }

  if ('agent_positions' in body) {
    const pos = body.agent_positions;
    if (pos === null || typeof pos !== 'object' || Array.isArray(pos)) {
      return { error: 'agent_positions must be an object' };
    }
  }

  if ('active_tab' in body && typeof body.active_tab !== 'string') {
    return { error: 'active_tab must be a string' };
  }

  return { data: body };
}

/**
 * Validates a user registration/login payload.
 * Normalizes email to trimmed lowercase before returning data.
 */
export function validateUserInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const { email, password } = body;

  if (!email || typeof email !== 'string' || !email.trim().includes('@')) {
    return { error: 'email is required and must be a valid email address' };
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return { error: 'password is required and must be at least 8 characters' };
  }

  return {
    data: {
      email:        email.trim().toLowerCase(),
      password,
      display_name: typeof body.display_name === 'string' ? body.display_name.trim() : '',
      auth_provider: typeof body.auth_provider === 'string' ? body.auth_provider : 'local',
    },
  };
}

/**
 * Validates a signup payload (email + password required, display_name optional).
 */
export function validateSignupInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const { email, password } = body;

  if (!email || typeof email !== 'string' || !email.trim().includes('@')) {
    return { error: 'email is required and must be a valid email address' };
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return { error: 'password is required and must be at least 8 characters' };
  }

  return {
    data: {
      email:        email.trim().toLowerCase(),
      password,
      display_name: typeof body.display_name === 'string' ? body.display_name.trim() : '',
    },
  };
}

/**
 * Validates a login payload (email + password only; no strength requirement on password).
 */
export function validateLoginInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const { email, password } = body;

  if (!email || typeof email !== 'string' || !email.trim().includes('@')) {
    return { error: 'email is required and must be a valid email address' };
  }

  if (!password || typeof password !== 'string') {
    return { error: 'password is required' };
  }

  return {
    data: {
      email:    email.trim().toLowerCase(),
      password,
    },
  };
}

/**
 * Validates a builtin skill payload (POST/PUT /api/builtin-skills).
 * Required: label, instruction. Optional: color, description.
 */
export function validateBuiltinSkillInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return { error: 'label is required' };
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) return { error: 'instruction is required' };

  return {
    data: {
      label,
      color: typeof body.color === 'string' && body.color ? body.color : '#6366f1',
      description: typeof body.description === 'string' ? body.description.trim() : '',
      instruction,
    },
  };
}

/**
 * Validates a persona category payload (POST/PUT /api/personas).
 * Required: label. Optional: color.
 */
export function validatePersonaCategoryInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return { error: 'label is required' };

  return {
    data: {
      label,
      color: typeof body.color === 'string' && body.color ? body.color : '#6366f1',
    },
  };
}

/**
 * Validates a persona payload (POST /api/personas/:categoryId/personas and PUT variant).
 * Required: name, systemPrompt. Optional: tagline, persona.
 */
export function validatePersonaInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'name is required' };
  const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
  if (!systemPrompt) return { error: 'systemPrompt is required' };

  return {
    data: {
      name,
      tagline: typeof body.tagline === 'string' ? body.tagline.trim() : '',
      persona: typeof body.persona === 'string' ? body.persona.trim() : '',
      systemPrompt,
    },
  };
}

/**
 * Validates a draft agent payload sent to POST /api/drafts/:workspaceId.
 */
export function validateDraftInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  if (!body.agentData || typeof body.agentData !== 'object' || Array.isArray(body.agentData)) {
    return { error: 'agentData is required and must be an object' };
  }
  return { data: { agentData: body.agentData } };
}

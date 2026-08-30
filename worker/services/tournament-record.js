/** Revision metadata is transport/persistence state, not tournament JSON. */
export function withRevision(tournament, revision) {
  return { ...tournament, revision };
}

export function withoutRevision(tournament) {
  const copy = { ...tournament };
  delete copy.revision;
  return copy;
}

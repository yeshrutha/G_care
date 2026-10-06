export async function readOwnerResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (data === null) throw new Error('Owner service could not be reached. Check that the backend is running, then try again.');
  return data;
}

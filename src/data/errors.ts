/** An error whose message is safe and friendly enough to show to the user. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  console.error(err);
  return 'Something went wrong. Please try again.';
}

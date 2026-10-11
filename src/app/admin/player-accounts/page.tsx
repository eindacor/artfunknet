import PlayerAccountAdmin from "./player-account-admin";

export default function PlayerAccountsAdminPage() {
  return (
    <main className="admin-tools">
      <h1>Player accounts</h1>
      <section>
        <h2>Account metadata and overrides</h2>
        <p>
          Find an account by its exact email address to review its metadata,
          manage supporter status, or assign a temporary password.
        </p>
        <PlayerAccountAdmin />
      </section>
    </main>
  );
}

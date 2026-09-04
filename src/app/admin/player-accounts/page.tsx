import PlayerAccountRecovery from "./player-account-recovery";

export default function PlayerAccountsAdminPage() {
  return (
    <main className="admin-tools">
      <h1>Player accounts</h1>
      <section>
        <h2>Manual password recovery</h2>
        <p>
          Find an account by its exact email address and assign a temporary
          password. Send the password to the player through a trusted private
          channel and ask them to replace it from their Account page.
        </p>
        <PlayerAccountRecovery />
      </section>
    </main>
  );
}

import SendForm from "./SendForm";

export default function SendPage({
  searchParams,
}: {
  searchParams: {
    sent?: string;
    known?: string;
    delivered?: string;
    error?: string;
    plate?: string;
  };
}) {
  const sent = searchParams.sent === "1";
  const known = searchParams.known === "1";
  const delivered = searchParams.delivered === "1";

  return (
    <div className="container">
      <h1>Bericht versturen</h1>
      <p className="muted">
        Stuur een functionele melding naar een kenteken. Per bericht kies je of
        je naam zichtbaar is.
      </p>

      {searchParams.error === "plate" && (
        <div className="notice warn">Dat lijkt geen geldig kenteken.</div>
      )}
      {searchParams.error === "leeg" && (
        <div className="notice warn">Schrijf nog een bericht.</div>
      )}

      {sent &&
        (delivered ? (
          <div className="notice ok">
            Verstuurd. Dit kenteken is bekend in het systeem — de bestuurder
            krijgt je melding.
          </div>
        ) : known ? (
          <div className="notice warn">
            Verstuurd, maar de ontvanger heeft je geblokkeerd, dus de melding
            wordt niet getoond.
          </div>
        ) : (
          <div className="notice info">
            Verstuurd. Dit kenteken is nog niet geregistreerd — je melding wacht
            tot de bestuurder zich aanmeldt. (Dekking is het hoogst binnen een
            startgroep.)
          </div>
        ))}

      <div className="card">
        <SendForm initialPlate={searchParams.plate} />
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Anoniem is alleen anoniem voor de ontvanger — achter elk bericht zit je
        geverifieerde account, zodat blokkeren en melden blijven werken.
      </p>
    </div>
  );
}

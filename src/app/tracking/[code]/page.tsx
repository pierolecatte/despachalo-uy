// Placeholder — Página pública de tracking (se implementa en Etapa 4)
export default function TrackingPage({
    params,
}: {
    params: Promise<{ code: string }>
}) {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <h1 className="text-2xl font-bold">Seguimiento de envío</h1>
        </div>
    )
}

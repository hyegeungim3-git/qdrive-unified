import { Panel } from '../../components/ui'
import { META_EDGES, RELATION_GLOSSARY, SPACES, spaceOf } from './meta'

/**
 * 관계 문법 — 어느 스페이스에서 어느 스페이스로 어떤 관계만 허용되는지.
 * "표준 밖 관계는 만들지 않는다"가 확장성의 근거다.
 */
export default function Grammar() {
  const allRelations = [...new Set(META_EDGES.flatMap((e) => e.relations))]

  return (
    <div className="space-y-3">
      <Panel
        title="관계 문법 — 허용된 관계만 만든다"
        right={<span className="text-[11px] font-semibold text-gray-500">{META_EDGES.length}개 방향 · 관계 어휘 {allRelations.length}종</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500">
                <th className="py-2 pr-3 font-semibold">출발 스페이스</th>
                <th className="py-2 pr-3 font-semibold">도착 스페이스</th>
                <th className="py-2 pr-3 font-semibold">허용 관계 어휘</th>
                <th className="py-2 font-semibold">뜻</th>
              </tr>
            </thead>
            <tbody>
              {META_EDGES.map((e) => {
                const a = spaceOf(e.from)
                const b = spaceOf(e.to)
                return (
                  <tr key={`${e.from}-${e.to}`} className={`border-b border-gray-800/60 ${e.core ? 'bg-sky-500/5' : ''}`}>
                    <td className="py-2 pr-3">
                      <span className="font-bold" style={{ color: a.color }}>
                        {a.ko}
                      </span>
                      <span className="ml-1 text-[10.5px] text-gray-600">{a.en}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-bold" style={{ color: b.color }}>
                        {b.ko}
                      </span>
                      <span className="ml-1 text-[10.5px] text-gray-600">{b.en}</span>
                      {e.core && <span className="ml-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-sky-300">핵심</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {e.relations.map((r) => (
                          <span
                            key={r}
                            title={RELATION_GLOSSARY[r]}
                            className="cursor-help rounded bg-gray-800 px-1.5 py-0.5 text-[11px] font-semibold text-gray-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 break-keep text-gray-500">{e.desc}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 break-keep text-[11.5px] leading-relaxed text-gray-300">
          <b className="text-emerald-400">이 표 밖의 관계는 만들지 않습니다.</b> 관계 어휘를 자유롭게 늘리면 당장은 편하지만, 나중에 다른 도시·다른
          사업자 데이터와 합칠 때 아무것도 맞지 않습니다. 스페이스 쌍마다 쓸 수 있는 말을 못 박아 두는 것이 확장성의 실체입니다.
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <Panel title="관계 어휘 사전" right={<span className="text-[11px] text-gray-500">{allRelations.length}종</span>}>
          <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {allRelations.map((r) => (
              <div key={r} className="flex gap-2.5 border-b border-gray-800/50 py-1 last:border-0">
                <span className="w-[92px] shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-center text-[10.5px] font-bold text-gray-300">{r}</span>
                <span className="break-keep text-[11.5px] leading-relaxed text-gray-500">{RELATION_GLOSSARY[r] ?? '—'}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="스페이스별 노드 타입" right={<span className="text-[11px] text-gray-500">{SPACES.reduce((n, s) => n + s.types.length, 0)}종</span>}>
          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {SPACES.map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex items-baseline gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="text-[12px] font-bold" style={{ color: s.color }}>
                    {s.ko}
                  </span>
                  <span className="text-[10.5px] text-gray-600">{s.en}</span>
                </div>
                <div className="flex flex-wrap gap-1 pl-3.5">
                  {s.types.map((t) => (
                    <span key={t.en} className="rounded border border-gray-800 bg-gray-900/60 px-1.5 py-0.5 text-[10.5px] text-gray-300" title={t.note}>
                      {t.ko}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}

import { useSim } from '../../sim/store'
import { ActionCenterList } from '../../components/ActionCenter'

/** 대구시 조치함 — 구 "AI 업무 자동화 센터"의 대구시 업무를 시티 대시보드 맥락으로 이관. */
export default function ActionCenterModal({ onClose }: { onClose: () => void }) {
  const snap = useSim()
  return (
    <div className="fixed inset-0 z-[3000] flex items-start justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 px-5 py-4 shadow-2xl">
          <div>
            <div className="text-[10px] font-semibold tracking-widest text-violet-400">AI WORK AUTOMATION · 대구시</div>
            <h2 className="mt-0.5 text-lg font-bold text-gray-100">🗂️ 조치함</h2>
            <div className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
              에이전트가 데이터 수집→분석→문서 초안까지 처리합니다. 담당자는 검토·승인만 — 정산 확정 등은
              자동화하지 않습니다.
            </div>
          </div>
          <button onClick={onClose} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-gray-100">
            ✕ 닫기
          </button>
        </div>
        <ActionCenterList owner="대구시" snap={snap} />
      </div>
    </div>
  )
}

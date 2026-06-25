import { Lightbulb } from 'lucide-react';

interface KeyPoint {
  title: string;
  body: string;
}

// MVP notes for Notice.ai: a short list of the key points that define the
// product's first version. Edit this array to change what the tab shows.
const KEY_POINTS: KeyPoint[] = [
  {
    title: 'Replace this with your first key point',
    body: 'Each key point is a heading and a few sentences of detail. Keep them short and focused on what matters for the MVP. Add, remove, or reorder entries in the KEY_POINTS array.',
  },
  {
    title: 'Second key point',
    body: 'These notes live entirely in the front end, so changing them is a one-line edit and a redeploy. There is no backend or storage involved.',
  },
];

// The MVP Notes page: a simple, readable list of the key points that frame the
// first version of Notice.ai.
export function NoticeNotes() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-center gap-3">
        <Lightbulb className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-bold text-slate-900">MVP Notes</h1>
      </div>

      <ol className="space-y-4">
        {KEY_POINTS.map((point, i) => (
          <li
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="mb-1 flex items-baseline gap-2 text-base font-semibold text-slate-900">
              <span className="text-sm font-bold text-emerald-500">{i + 1}.</span>
              {point.title}
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">{point.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

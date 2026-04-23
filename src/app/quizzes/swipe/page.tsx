// src/app/quizzes/swipe/page.tsx  (server component)
import { SwipeClient } from "./SwipeClient";

export const metadata = {
  title: "Import Quiz | Content Hub",
};

export default function QuizSwipePage() {
  return (
    <div className="p-8">
      <SwipeClient />
    </div>
  );
}

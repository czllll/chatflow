"use client";

import { useEffect, useRef, useState } from "react";
import getCaretCoordinates from "textarea-caret";

interface SmoothCaretProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isActive: boolean;
}

export default function SmoothCaret({ textareaRef, isActive }: SmoothCaretProps) {
  const caretRef = useRef<HTMLDivElement>(null);
  const [caretPosition, setCaretPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const updateCaretPosition = () => {
      if (!isActive || !textarea) {
        setIsVisible(false);
        return;
      }

      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // Only show caret when there's no selection
      if (selectionStart !== selectionEnd) {
        setIsVisible(false);
        return;
      }

      setIsVisible(true);

      // Use textarea-caret library to get accurate caret position
      const coordinates = getCaretCoordinates(textarea, selectionStart);
      
      // Smooth animation using requestAnimationFrame
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        setCaretPosition({ 
          x: coordinates.left + 16, // Add padding offset
          y: coordinates.top + 12  // Add padding offset
        });
      });
    };

    // Update caret position on various events
    const events = ["input", "click", "keyup", "keydown", "focus", "scroll"];
    events.forEach((event) => {
      textarea.addEventListener(event, updateCaretPosition);
    });

    // Initial position
    updateCaretPosition();

    return () => {
      events.forEach((event) => {
        textarea.removeEventListener(event, updateCaretPosition);
      });
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [textareaRef, isActive]);

  if (!isVisible) return null;

  return (
    <div
      ref={caretRef}
      className="absolute pointer-events-none z-10"
      style={{
        left: `${caretPosition.x}px`,
        top: `${caretPosition.y}px`,
        transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Main caret line */}
      <div className="relative">
        <div
          className="w-0.5 h-6 bg-purple-600 dark:bg-purple-500 animate-blink"
          style={{
            animation: "blink 1s step-end infinite",
          }}
        />
        
        {/* Comet tail effect */}
        <div
          className="absolute top-0 left-0 w-0.5 h-6 bg-gradient-to-b from-purple-400/60 via-purple-300/30 to-transparent dark:from-purple-500/60 dark:via-purple-400/30 blur-sm"
          style={{
            transform: "translateX(-1px) scaleY(1.5)",
            animation: "tail-glow 1s ease-in-out infinite",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes blink {
          0%, 50% {
            opacity: 1;
          }
          51%, 100% {
            opacity: 0;
          }
        }

        @keyframes tail-glow {
          0%, 100% {
            opacity: 0.3;
            transform: translateX(-1px) scaleY(1.5);
          }
          50% {
            opacity: 0.6;
            transform: translateX(-1px) scaleY(2);
          }
        }
      `}</style>
    </div>
  );
}


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
          x: coordinates.left + 16,
          y: coordinates.top + 16
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
      className="absolute pointer-events-none z-50"
      style={{
        left: `${caretPosition.x}px`,
        top: `${caretPosition.y}px`,
        transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Main caret line */}
      <div className="relative">
        <div
          className="w-0.5 h-5 bg-amber-600 dark:bg-amber-500"
          style={{
            animation: "blink 1s step-end infinite",
          }}
        />
        
        {/* Comet tail effect - multiple layers for visibility */}
        <div
          className="absolute top-0 -left-0.5 w-1.5 h-6 bg-gradient-to-b from-amber-500 via-amber-400/60 to-transparent"
          style={{
            filter: "blur(2px)",
            animation: "tail-glow 1s ease-in-out infinite",
            transformOrigin: "top center",
          }}
        />
        <div
          className="absolute top-0 -left-0.5 w-1 h-5 bg-gradient-to-b from-amber-500/90 via-amber-400/50 to-transparent"
          style={{
            filter: "blur(0.5px)",
            animation: "tail-glow 1s ease-in-out infinite 0.1s",
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
            opacity: 0.5;
            transform: scaleY(1.2);
          }
          50% {
            opacity: 0.9;
            transform: scaleY(1.6);
          }
        }
      `}</style>
    </div>
  );
}


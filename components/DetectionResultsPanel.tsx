'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ChevronDown, ChevronRight, Eye, EyeOff, ShieldAlert, AlertTriangle } from 'lucide-react';
import { REDACTION_CATEGORIES, getAllSubcategoryIds, isCriticalCategory } from '@/lib/redaction-categories';

interface Detection {
  text: string;
  category: string;
  startIndex: number;
  endIndex: number;
  start: number;
  end: number;
}

interface DetectionResultsPanelProps {
  segments: any[];
  onDetectionsFound: (detections: Detection[]) => void;
  detections: Detection[];
  redactedDetections: Set<string>;
  onToggleRedaction: (detection: Detection) => void;
  onAutoRedact: (detections: Detection[]) => void;
  isHydrated: boolean;
}

// Category color mapping
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'personal-identifiers': {
    bg: 'bg-red-100 dark:bg-red-950',
    text: 'text-red-900 dark:text-red-100',
    border: 'border-red-500',
  },
  'contact-information': {
    bg: 'bg-orange-100 dark:bg-orange-950',
    text: 'text-orange-900 dark:text-orange-100',
    border: 'border-orange-500',
  },
  'location-information': {
    bg: 'bg-yellow-100 dark:bg-yellow-950',
    text: 'text-yellow-900 dark:text-yellow-100',
    border: 'border-yellow-500',
  },
  'vehicle-information': {
    bg: 'bg-blue-100 dark:bg-blue-950',
    text: 'text-blue-900 dark:text-blue-100',
    border: 'border-blue-500',
  },
  'government-ids': {
    bg: 'bg-purple-100 dark:bg-purple-950',
    text: 'text-purple-900 dark:text-purple-100',
    border: 'border-purple-500',
  },
  'financial-information': {
    bg: 'bg-pink-100 dark:bg-pink-950',
    text: 'text-pink-900 dark:text-pink-100',
    border: 'border-pink-500',
  },
  'dates-times': {
    bg: 'bg-green-100 dark:bg-green-950',
    text: 'text-green-900 dark:text-green-100',
    border: 'border-green-500',
  },
  'organizations': {
    bg: 'bg-cyan-100 dark:bg-cyan-950',
    text: 'text-cyan-900 dark:text-cyan-100',
    border: 'border-cyan-500',
  },
};

export function getCategoryColor(categoryId: string) {
  // Find the parent category
  for (const category of REDACTION_CATEGORIES) {
    if (category.id === categoryId) {
      return CATEGORY_COLORS[categoryId] || CATEGORY_COLORS['personal-identifiers'];
    }
    if (category.subcategories?.some(sub => sub.id === categoryId)) {
      return CATEGORY_COLORS[category.id] || CATEGORY_COLORS['personal-identifiers'];
    }
  }
  return CATEGORY_COLORS['personal-identifiers'];
}

export function DetectionResultsPanel({
  segments,
  onDetectionsFound,
  detections,
  redactedDetections,
  onToggleRedaction,
  onAutoRedact,
  isHydrated,
}: DetectionResultsPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [hasAnalyzed, setHasAnalyzed] = useState(() => detections.length > 0);

  useEffect(() => {
    if (detections.length > 0) {
      setHasAnalyzed(true);
    }
  }, [detections.length]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleAnalyze = useCallback(async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Analyze ALL categories
      const allCategories = getAllSubcategoryIds();

      const response = await fetch('/api/smart-redact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segments,
          selectedSubcategories: allCategories,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Detection failed');
      }

      console.log('Detections found:', data);

      if (data.matches && data.matches.length > 0) {
        onDetectionsFound(data.matches);

        // Auto-redact critical items
        const criticalDetections = data.matches.filter((d: Detection) =>
          isCriticalCategory(d.category)
        );

        if (criticalDetections.length > 0) {
          console.log(`Auto-redacting ${criticalDetections.length} critical items`);
          onAutoRedact(criticalDetections);
        }

        setHasAnalyzed(true);
      } else {
        setError('No PII detected in this transcript');
        setHasAnalyzed(true);
      }
    } catch (err) {
      console.error('Detection error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to detect PII';
      setError(`${errorMessage}. Please check your OpenAI API key and try again.`);
    } finally {
      setIsProcessing(false);
    }
  }, [segments, onDetectionsFound, onAutoRedact]);

  // Auto-analyze once segments are available and no cached detections are present
  useEffect(() => {
    if (!isHydrated) return;
    if (segments && segments.length > 0 && detections.length === 0 && !hasAnalyzed) {
      handleAnalyze();
    }
  }, [segments, detections.length, hasAnalyzed, isHydrated, handleAnalyze]);

  const getCategoryLabel = (subcategoryId: string) => {
    for (const category of REDACTION_CATEGORIES) {
      const subcategory = category.subcategories?.find(sub => sub.id === subcategoryId);
      if (subcategory) {
        return subcategory.label;
      }
    }
    return subcategoryId;
  };

  const getDetectionKey = (detection: Detection) => {
    return `${detection.start}-${detection.end}-${detection.text}`;
  };

  // Show loading state during analysis
  if (isProcessing && !hasAnalyzed) {
    return (
      <div className="h-full flex flex-col items-center justify-center border-l bg-background p-8">
        <Sparkles className="h-12 w-12 text-primary animate-pulse mb-4" />
        <h3 className="font-semibold text-lg mb-2">Analyzing Transcript</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">
          AI is detecting sensitive information...
        </p>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error state
  if (error && detections.length === 0) {
    return (
      <div className="h-full flex flex-col border-l bg-background">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">PII Detection</h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-destructive text-center">{error}</p>
          <Button
            onClick={(e) => {
              setHasAnalyzed(false);
              handleAnalyze();
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            className="mt-4"
          >
            Retry Analysis
          </Button>
        </div>
      </div>
    );
  }

  // Group detections by category
  const groupedDetections = detections.reduce((acc, detection) => {
    const category = detection.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(detection);
    return acc;
  }, {} as Record<string, Detection[]>);

  // Separate critical and suggested detections
  const criticalDetections = detections.filter(d => isCriticalCategory(d.category));
  const suggestedDetections = detections.filter(d => !isCriticalCategory(d.category));

  return (
    <div className="h-full flex flex-col border-l bg-background">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Detected PII</h3>
          </div>
          <Button
            onClick={(e) => {
              setHasAnalyzed(false);
              handleAnalyze();
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            size="sm"
            variant="outline"
            disabled={isProcessing}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Re-analyze'}
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {detections.length} items detected
          </p>
          {criticalDetections.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <ShieldAlert className="h-3 w-3 text-destructive" />
              <span className="text-destructive font-medium">
                {criticalDetections.length} auto-redacted
              </span>
            </div>
          )}
          {suggestedDetections.length > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <AlertTriangle className="h-3 w-3 text-orange-500" />
              <span className="text-orange-500 font-medium">
                {suggestedDetections.length} suggested
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {Object.entries(groupedDetections).map(([categoryId, categoryDetections]) => {
          const colors = getCategoryColor(categoryId);
          const categoryLabel = getCategoryLabel(categoryId);
          const isExpanded = expandedCategories.has(categoryId);
          const isCritical = isCriticalCategory(categoryId);

          return (
            <div key={categoryId} className={`border-l-4 ${colors.border} rounded-r-lg overflow-hidden`}>
              <button
                onClick={() => toggleCategory(categoryId)}
                className={`w-full p-3 ${colors.bg} ${colors.text} flex items-center justify-between hover:opacity-80 transition-opacity`}
              >
                <div className="flex items-center gap-2">
                  {isCritical && <ShieldAlert className="h-4 w-4" />}
                  <span className="font-semibold text-sm">{categoryLabel}</span>
                  <span className="text-xs bg-background/30 px-2 py-0.5 rounded-full">
                    {categoryDetections.length}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {isExpanded && (
                <div className="bg-card">
                  {categoryDetections.map((detection, idx) => {
                    const key = getDetectionKey(detection);
                    const isRedacted = redactedDetections.has(key);
                    const isCriticalItem = isCriticalCategory(detection.category);

                    return (
                      <button
                        key={idx}
                        onClick={() => onToggleRedaction(detection)}
                        className="w-full p-3 border-t flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-medium text-sm">{detection.text}</div>
                            {isCriticalItem && (
                              <span className="text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded">
                                Auto-redacted
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(detection.start)} - {formatTime(detection.end)}
                          </div>
                        </div>
                        {isRedacted ? (
                          <EyeOff className="h-4 w-4 text-destructive" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

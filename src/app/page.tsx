'use client';

import { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit,
  FileText,
  KeyRound,
  Loader,
  Save,
  Download,
  Play,
  StopCircle,
} from 'lucide-react';
import { analyzePRDForTemperature } from '@/ai/flows/analyze-prd-temperature';
import { generateSyntheticData } from '@/ai/flows/generate-synthetic-data';
import { ensureDataQualityWithReasoning } from '@/ai/flows/data-quality-assurance';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import type { AnalyzePRDForTemperatureOutput } from '@/ai/flows/analyze-prd-temperature';

const MAX_ENTRIES = 10000; // Reduced for demo purposes from 1,000,000

type DataEntry = {
  id: number;
  content: string;
};

export default function DataGeniusPage() {
  const [apiKey, setApiKey] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [isApiKeySaved, setIsApiKeySaved] = useState(false);
  const [prd, setPrd] = useState('');
  const [dataPreview, setDataPreview] = useState<DataEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [temperatureInfo, setTemperatureInfo] =
    useState<AnalyzePRDForTemperatureOutput | null>(null);

  const isGeneratingRef = useRef(false);
  const fullDataRef = useRef<DataEntry[]>([]);

  const { toast } = useToast();

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsApiKeySaved(true);
    }
  }, []);

  const handleSaveKey = (key: string) => {
    if (key) {
      setApiKey(key);
      localStorage.setItem('gemini_api_key', key);
      setIsApiKeySaved(true);
      toast({
        title: 'Success',
        description: 'API Key saved successfully.',
      });
      return true;
    }
    toast({
      variant: 'destructive',
      title: 'Error',
      description: 'API Key cannot be empty.',
    });
    return false;
  };

  const handleStop = () => {
    isGeneratingRef.current = false;
    setIsGenerating(false);
    setError('Data generation stopped by user.');
  };

  const isApiKeyError = (e: any): boolean => {
    const msg = e.message.toLowerCase();
    return msg.includes('api key') || msg.includes('429') || msg.includes('rate limit');
  };

  const handleDownload = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'id,content\n' +
      fullDataRef.current
        .map(e => `${e.id},"${e.content.replace(/"/g, '""')}"`)
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'datagenius_dataset.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleGenerate = async () => {
    if (!prd.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Product Requirements Document (PRD) cannot be empty.' });
        return;
    }

    setError(null);
    setTemperatureInfo(null);
    isGeneratingRef.current = true;
    setIsGenerating(true);
    fullDataRef.current = [];
    setDataPreview([]);
    setProgress(0);

    try {
        const tempAnalysis = await analyzePRDForTemperature({ prd });
        setTemperatureInfo(tempAnalysis);

        while (fullDataRef.current.length < MAX_ENTRIES && isGeneratingRef.current) {
            let successfulChunk = false;
            let retries = 0;

            while (!successfulChunk && retries < 3 && isGeneratingRef.current) {
                try {
                    const modifiedPrd = prd + `\n\n---\n\nGenerate a small, sample dataset of about 5-10 diverse and human-like entries based on the above PRD. Format the output as plain text, with each entry on a new line. Do not include headers or numbering.`;
                    const dataChunk = await generateSyntheticData({ prd: modifiedPrd });
                    
                    const entries = dataChunk.split('\n').filter(line => line.trim() !== '');

                    for (const entry of entries) {
                        if (!isGeneratingRef.current || fullDataRef.current.length >= MAX_ENTRIES) break;
                        
                        const qualityResult = await ensureDataQualityWithReasoning({ prd, datasetEntry: entry });
                        
                        const newId = fullDataRef.current.length + 1;
                        const newEntry = { id: newId, content: qualityResult.refinedDatasetEntry };

                        fullDataRef.current.push(newEntry);
                        setDataPreview(prev => [newEntry, ...prev].slice(0, 100));
                        
                        const newProgress = Math.min(100, (fullDataRef.current.length / MAX_ENTRIES) * 100);
                        setProgress(newProgress);
                    }
                    successfulChunk = true;

                } catch (e: any) {
                    console.error(e);
                    retries++;
                    if (isApiKeyError(e)) {
                        setError('API key limit reached or invalid. Please provide a new key to continue.');
                        setShowKeyDialog(true);
                        isGeneratingRef.current = false;
                        setIsGenerating(false);
                        return;
                    }
                    setError(`An error occurred. Retrying in 5 seconds... (Attempt ${retries})`);
                    await new Promise(res => setTimeout(res, 5000));
                    setError(null);
                }
            }
            if (!successfulChunk) {
                throw new Error("Failed to generate data after multiple retries.");
            }
        }
    } catch (e: any) {
        console.error(e);
        setError(e.message || 'An unexpected error occurred.');
    } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
        if (fullDataRef.current.length >= MAX_ENTRIES) {
             toast({ title: "Success!", description: "Dataset generation complete." });
        }
    }
};

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <main className="container mx-auto p-4 md:p-8">
        <header className="text-center mb-10">
          <h1 className="text-5xl font-bold text-primary font-headline">
            DataGenius
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Generate vast, high-quality datasets with the power of AI.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 flex flex-col gap-8">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="text-primary" />
                  <span>API Key Management</span>
                </CardTitle>
                <CardDescription>
                  Enter your Gemini API key. It will be saved securely in your
                  browser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="api-key">Gemini API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="Enter your API key"
                      defaultValue={apiKey}
                      onChange={e => setTempApiKey(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleSaveKey(tempApiKey || apiKey)}
                      aria-label="Save API Key"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                  {isApiKeySaved && (
                    <p className="text-sm text-green-600">
                      API Key is configured.
                    </p>
                  )}
                   <p className="text-xs text-muted-foreground pt-2">
                    Note: For this demo, API calls may rely on a pre-configured server key if yours fails.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="text-primary" />
                  <span>Product Requirements</span>
                </CardTitle>
                <CardDescription>
                  Describe the dataset you want to generate. Be as detailed as
                  possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="e.g., 'A dataset of customer support chat logs for an e-commerce fashion store. Include user complaints, questions about returns, and positive feedback...'"
                  className="min-h-[200px]"
                  value={prd}
                  onChange={e => setPrd(e.target.value)}
                  disabled={isGenerating}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="text-primary" />
                  <span>AI Data Generation</span>
                </CardTitle>
                <CardDescription>
                  Start the generation process. You can stop anytime. Progress is auto-saved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  {!isGenerating ? (
                    <Button className="w-full sm:w-auto flex-grow bg-primary hover:bg-primary/90" onClick={handleGenerate} disabled={!isApiKeySaved || !prd}>
                      <Play className="mr-2" />
                      Generate Dataset
                    </Button>
                  ) : (
                    <Button className="w-full sm:w-auto flex-grow" variant="destructive" onClick={handleStop}>
                      <StopCircle className="mr-2" />
                      Stop Generation
                    </Button>
                  )}

                  <Button className="w-full sm:w-auto" variant="secondary" onClick={handleDownload} disabled={fullDataRef.current.length === 0}>
                    <Download className="mr-2" />
                    Download CSV
                  </Button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <Label>Progress</Label>
                            <span className="text-sm font-medium text-primary">
                                {fullDataRef.current.length.toLocaleString()} / {MAX_ENTRIES.toLocaleString()}
                            </span>
                        </div>
                        <Progress value={progress} className="w-full" />
                    </div>

                    {temperatureInfo && (
                        <div className="p-4 bg-muted/50 rounded-lg border">
                            <h4 className="font-semibold text-sm mb-1">AI Temperature Analysis</h4>
                            <p className="text-sm text-muted-foreground">
                                <Badge variant="outline" className="mr-2 border-accent text-accent">{temperatureInfo.temperature.toFixed(2)}</Badge>
                                {temperatureInfo.reasoning}
                            </p>
                        </div>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <div className="mt-6 relative">
                    <div className="overflow-auto max-h-[500px] border rounded-lg">
                      <Table>
                          <TableHeader className="sticky top-0 bg-card">
                              <TableRow>
                                  <TableHead className="w-[100px]">Entry ID</TableHead>
                                  <TableHead>Generated Data</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {dataPreview.length > 0 ? (
                                  dataPreview.map(entry => (
                                      <TableRow key={entry.id}>
                                          <TableCell className="font-medium">{entry.id}</TableCell>
                                          <TableCell>{entry.content}</TableCell>
                                      </TableRow>
                                  ))
                              ) : (
                                  <TableRow>
                                      <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                                          {isGenerating ? 'Generating data...' : 'Generated data will appear here.'}
                                      </TableCell>
                                  </TableRow>
                              )}
                          </TableBody>
                      </Table>
                    </div>
                    {isGenerating && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                            <Loader className="animate-spin text-primary h-10 w-10" />
                        </div>
                    )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <AlertDialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New API Key Required</AlertDialogTitle>
            <AlertDialogDescription>
              {error || 'The previous API key failed. Please enter a new Gemini API key to resume data generation.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="new-api-key" className="sr-only">New API Key</Label>
            <Input
              id="new-api-key"
              type="password"
              placeholder="Enter new Gemini API key"
              onChange={(e) => setTempApiKey(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (handleSaveKey(tempApiKey)) {
                setShowKeyDialog(false);
                setError(null);
                // Automatically resume generation
                handleGenerate();
              }
            }}>
              Save and Resume
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

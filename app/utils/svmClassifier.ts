import * as ort from 'onnxruntime-react-native';
import tfidfConfig from '@/app/assets/ml/tfidf_config.json';
import labelMap from '@/app/assets/ml/label_classes.json';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

//Singleton ONNX session
let session: ort.InferenceSession | null = null;

// -- Loads the ONNX model from assets and prepares it --
export async function loadModel() {
  if (session) {
    console.log("Reusing existing ONNX session.");
    return session;
  }
  console.log("Preparing to load ONNX model from assets...");

  const modelAsset = Asset.fromModule(require('@/app/assets/ml/svm_model_1.0.onnx'));
  await modelAsset.downloadAsync();
  const modelPath = `${FileSystem.cacheDirectory}svm_model_1.0.onnx`;
  await FileSystem.copyAsync({ from: modelAsset.localUri!, to: modelPath });

  console.log("Model copied to cache path:", modelPath);

  session = await ort.InferenceSession.create(modelPath);
  console.log("ONNX model loaded successfully.");
  return session;
}

// Add unloadModel function
export function unloadModel() {
  if (session) {
    console.log("Unloading ONNX model session.");
    session = null;
  }
}


//let vocabIndexMap: { [token: string]: number } | null = null;

// -- Converts input text into a TF-IDF vector --
function transform(text: string): number[] {
  const vocab = tfidfConfig.vocabulary;
  const idf = tfidfConfig.idf;
  
  //Safety check: Ensure vocab and IDF arrays match
  if (vocab.length !== idf.length) {
    throw new Error("TF-IDF config mismatch: vocab and idf length differ.");
  }

  // Cache the vocab-to-index map
  //if (!vocabIndexMap) {
    //vocabIndexMap = {};
    //vocab.forEach((word, i) => {
      //vocabIndexMap![word] = i;
    //});
  //}

  // Create vocab-index map
  const vocabIndexMap: { [token: string]: number } = {};
  vocab.forEach((word, i) => {
    vocabIndexMap[word] = i;
  }); 
  
  const tokens = text.toLowerCase().match(/\b\w+\b/g) || [];
  const vector = Array(vocab.length).fill(0);
  tokens.forEach(token => {
    const index = vocabIndexMap[token];
    if (typeof index === 'number') {
      vector[index] += idf[index];
    }
  });
  return vector;
}

// -- Main classification function --
export async function classify(text: string): Promise<string> {
  try {
    if (!text || text.trim() === '') return "unknown";

    console.log("Classify called with input:", text);
    
    console.log("Calling loadModel... (make sure Vosk is fully initialized)");
    const session = await loadModel();  //ensure model is loaded
    console.log("ONNX model loaded, proceeding to inference...");
    
    const inputVector = Float32Array.from(transform(text));
    const tensor = new ort.Tensor('float32', inputVector, [1, inputVector.length]);
    
    const results = await session.run({ input: tensor });

    const outputName = session.outputNames[0];
    const outputTensor = results[outputName].data;

    console.log("Model inference complete, raw output:", outputTensor); 

    const predictedIndex = outputTensor[0];
    console.log("Predicted index:", predictedIndex);
    const predictionLabel = labelMap[predictedIndex] || "unknown";
  
    console.log("Final predicted label:", predictionLabel);
    return predictionLabel;
    
  } catch (error) {
    console.error("SVM classification failed:", error);
    return "unknown";
  }
}





<?php
/**
 * Remote Media Upload Bridge for Shared Hosting
 * Upload this file as `upload.php` to your Shared Hosting subdomain (e.g. media.yourdomain.com)
 */

// 1. SET YOUR SECRET KEY (Must match the Secret Key in Web Settings -> Media Storage tab)
define('SECRET_KEY', 'your_secure_secret_key_here');

// 2. SET YOUR SUBDOMAIN PUBLIC BASE URL (No trailing slash)
define('MEDIA_BASE_URL', 'https://media.yourdomain.com');

// Enable CORS if needed
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, x-api-secret");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Only POST requests allowed']);
    exit();
}

// Check Security API Secret Header
$headers = getallheaders();
$providedSecret = isset($headers['x-api-secret']) ? $headers['x-api-secret'] : (isset($_SERVER['HTTP_X_API_SECRET']) ? $_SERVER['HTTP_X_API_SECRET'] : '');

if (empty($providedSecret) || $providedSecret !== SECRET_KEY) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Unauthorized: Invalid secret key']);
    exit();
}

// Check for Delete Request
if (isset($_POST['action']) && $_POST['action'] === 'delete') {
    $fileUrl = isset($_POST['fileUrl']) ? trim($_POST['fileUrl']) : '';
    if (!empty($fileUrl)) {
        $parts = explode('/uploads/', $fileUrl);
        if (count($parts) > 1) {
            $relativePath = trim($parts[1], '/');
            // Normalize path to prevent directory traversal
            $cleanRelativePath = str_replace(['..', '\\'], ['', '/'], $relativePath);
            $targetFilePath = realpath(__DIR__ . '/uploads') . '/' . $cleanRelativePath;
            $baseUploadDir = realpath(__DIR__ . '/uploads');
            
            // Check that target path is within baseUploadDir
            if ($baseUploadDir && strpos(realpath(dirname($targetFilePath)), $baseUploadDir) === 0) {
                if (file_exists($targetFilePath) && is_file($targetFilePath)) {
                    @unlink($targetFilePath);
                }
            }
        }
    }
    echo json_encode(['success' => true, 'message' => 'File deletion processed']);
    exit();
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No valid file uploaded']);
    exit();
}

$file = $_FILES['file'];

// Validate Size (10MB Max)
$maxSize = 10 * 1024 * 1024;
if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'File size exceeds limit of 10MB']);
    exit();
}

$uploadPath = isset($_POST['uploadPath']) ? trim($_POST['uploadPath']) : 'general';

// Sanitize subfolder path
$cleanSubfolder = trim(preg_replace('/[^a-zA-Z0-9_\-\/]/', '', $uploadPath), '/');
$targetDir = __DIR__ . '/uploads/' . ($cleanSubfolder ? $cleanSubfolder . '/' : '');

if (!file_exists($targetDir)) {
    mkdir($targetDir, 0755, true);
}

// Generate unique filename preserving extension
$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
$ext = $ext ? '.' . strtolower($ext) : '.jpg';

// Validate Extension
$allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp3', '.wav', '.pdf'];
if (!in_array($ext, $allowedExtensions)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid file extension. Allowed: jpg, jpeg, png, gif, webp, mp3, wav, pdf']);
    exit();
}

$filename = time() . '-' . bin2hex(random_bytes(4)) . $ext;
$targetFilePath = $targetDir . $filename;

if (move_uploaded_file($file['tmp_name'], $targetFilePath)) {
    $publicUrl = MEDIA_BASE_URL . '/uploads/' . ($cleanSubfolder ? $cleanSubfolder . '/' : '') . $filename;
    echo json_encode([
        'success' => true,
        'url' => $publicUrl,
        'fileName' => $filename,
        'path' => $publicUrl
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to save file on remote server']);
}

"""Tokinarc V6.C — apps/storage/views.py — khớp V6.B.3 §3.7"""
import os

from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from . import services
from .models import FileObject
from .serializers import FileObjectSerializer

# Hạn mức dung lượng 1 file (mặc định 25MB) — chặn upload khổng lồ làm cạn RAM
# (save_upload đọc thẳng file vào bộ nhớ). Override qua settings nếu cần.
DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Đuôi file thực thi/kịch bản nguy hiểm — chặn để tránh biến kho file thành nơi
# phát tán mã độc. Dùng blocklist (không phải whitelist) để không chặn nhầm
# các loại file nghiệp vụ hợp lệ (ảnh, âm thanh ghi âm, PDF, Excel, Word...).
BLOCKED_UPLOAD_EXTS = frozenset({
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.dll', '.sys', '.pif',
    '.sh', '.bash', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.jar',
    '.php', '.phtml', '.phar', '.py', '.pyc', '.pl', '.rb', '.cgi', '.asp',
    '.aspx', '.jsp', '.htaccess', '.app', '.deb', '.rpm', '.apk',
})


class UploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'detail': 'Thiếu file.', 'code': 'VALIDATION_FAILED'},
                            status=status.HTTP_400_BAD_REQUEST)

        max_bytes = getattr(settings, 'MAX_UPLOAD_SIZE_BYTES', DEFAULT_MAX_UPLOAD_BYTES)
        if f.size is not None and f.size > max_bytes:
            return Response(
                {'detail': f'File quá lớn ({f.size // 1024 // 1024}MB). '
                           f'Tối đa {max_bytes // 1024 // 1024}MB.', 'code': 'FILE_TOO_LARGE'},
                status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(f.name or '')[1].lower()
        if ext in BLOCKED_UPLOAD_EXTS:
            return Response(
                {'detail': f'Không cho phép tải lên file loại "{ext}" (nguy cơ mã độc).',
                 'code': 'FILE_TYPE_BLOCKED'}, status=status.HTTP_400_BAD_REQUEST)

        obj = services.save_upload(
            file=f, kind=request.data.get('kind', 'misc'),
            related_kind=request.data.get('related_kind', ''),
            related_id=request.data.get('related_id', ''), user=request.user)
        return Response(FileObjectSerializer(obj).data, status=status.HTTP_201_CREATED)


class FileObjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FileObject.objects.all()
    serializer_class = FileObjectSerializer
    permission_classes = [IsAuthenticated]

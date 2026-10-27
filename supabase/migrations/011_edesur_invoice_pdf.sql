-- La factura de EDESUR también se puede adjuntar como PDF.

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'edesur-meters';

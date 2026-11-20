-- The event's official name, from the owner's agenda (20 Nov): "the First" Al-Farabi Conference.
-- Shown on the certificate check page (/verify) and passed to the emails.
update public.events
   set name_ar = 'مؤتمر الفارابي الأول للبحوث التطبيقية في التحول الرقمي الشامل',
       name_en = 'The First Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation'
 where slug = 'alfarabi-conf-2026';

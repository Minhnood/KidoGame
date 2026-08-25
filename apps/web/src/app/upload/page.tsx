import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { getActor } from '@/lib/session';
import { UploadForm } from './upload-form';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const actor = await getActor();

  // Chặn ở server, không chỉ ở API: hiện form rồi mới báo lỗi sau khi bé đã chọn
  // file và chờ upload là trải nghiệm tệ.
  if (!actor) redirect('/be-dang-nhap');

  if (actor.kind !== 'child') {
    return (
      <>
        <PageTitle title="Đăng game" />
        <Notice tone="info">
          Game cần được đăng từ tài khoản của bé để ghi công đúng người làm. Bố mẹ{' '}
          <Link href="/phu-huynh" className="font-bold">
            tạo tài khoản cho bé ở đây
          </Link>{' '}
          rồi để bé tự đăng nhập nhé.
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Đăng game của bé" lead={`Game sẽ hiện tên ${actor.displayName}`} />
      <UploadForm />
    </>
  );
}

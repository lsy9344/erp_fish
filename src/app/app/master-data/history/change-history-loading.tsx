import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

const columns = [
  "변경 시각",
  "변경자",
  "대상 유형",
  "대상 이름",
  "변경 유형",
  "행 작업",
];

export default function ChangeHistoryLoading() {
  return (
    <div aria-label="변경 이력 로딩" className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <Skeleton className="h-14 w-40" />
        <Skeleton className="h-14 w-40" />
        <Skeleton className="h-14 w-36" />
        <Skeleton className="h-14 w-36" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column, columnIndex) => (
                  <TableCell key={column}>
                    <Skeleton
                      className={
                        columnIndex === columns.length - 1
                          ? "ml-auto h-9 w-20"
                          : "h-5 w-full max-w-32"
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
